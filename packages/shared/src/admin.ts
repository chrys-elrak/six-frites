import { z } from "zod";
import { Id, IsoDate, PageQuery } from "./common.js";
import { MessageEntity, MessageType } from "./chats.js";
import { ClientDevice } from "./presence.js";
import { StickerDTO } from "./stickers.js";
import { AttachmentDTO, UploadKind, UploadStatus } from "./uploads.js";

export const ReportReason = z.enum(["spam", "harassment", "sexual", "violence", "illegal", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;

export const CreateReportInput = z
  .object({
    messageId: Id.optional().describe("Report this message (and its sender)"),
    userId: Id.optional().describe("Report this person, someone you share a chat with"),
    anonMessageId: Id.optional().describe("Report this anonymous message you got, and whoever sent it"),
    reason: ReportReason,
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => [v.messageId, v.userId, v.anonMessageId].filter((x) => x !== undefined).length === 1,
    "Report either a message or a person",
  );
export type CreateReportInput = z.infer<typeof CreateReportInput>;

export const AdminMeDTO = z.object({
  admin: z.literal(true),
  twoFactor: z
    .enum(["setup", "required", "ok"])
    .describe("setup: no authenticator yet; required: enter a code on this session; ok: moderation is open"),
});
export type AdminMeDTO = z.infer<typeof AdminMeDTO>;

const TotpSecret = z.string().regex(/^[A-Z2-7]{32}$/, "Expected a base32 authenticator secret");

export const AdminSecretDTO = z.object({
  secret: TotpSecret,
  uri: z.string().describe("An otpauth:// link to show as a QR code"),
});
export type AdminSecretDTO = z.infer<typeof AdminSecretDTO>;

export const AdminCodeInput = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  secret: TotpSecret.optional().describe("Only the first time: the secret from POST /v1/admin/2fa/secret that the code was made with"),
});
export type AdminCodeInput = z.infer<typeof AdminCodeInput>;

/** The ban lengths admins pick from, in hours. */
export const BAN_HOURS = [1, 6, 24, 24 * 7, 24 * 30] as const;

const BanHours = z
  .number()
  .int()
  .min(1)
  .max(24 * 365)
  .optional()
  .describe("How many hours the ban lasts; until an admin lifts it when left out");

/** A full ban shuts the account; a chat ban leaves only anonymous messages and support, as for a guest. */
export const BanScope = z.enum(["full", "chat"]);
export type BanScope = z.infer<typeof BanScope>;

export const AdminUserRef = z.object({
  id: Id,
  displayName: z.string(),
  email: z.string(),
  avatarUrl: z.string().url().nullable(),
  bannedAt: IsoDate.nullable(),
  bannedUntil: IsoDate.nullable().describe("When the ban is lifted on its own; null when it lasts until an admin lifts it"),
  banScope: BanScope.describe("What the ban takes away, while bannedAt is set"),
});
export type AdminUserRef = z.infer<typeof AdminUserRef>;

export const AdminUserDTO = AdminUserRef.extend({
  banReason: z.string().nullable(),
  admin: z.boolean(),
  createdAt: IsoDate,
  lastActiveAt: IsoDate.nullable(),
  online: z.boolean().describe("Has the app open on at least one device right now"),
  devices: z.array(ClientDevice).describe("What they have it open on right now; empty when offline"),
  chats: z.number().int(),
  messages: z.number().int(),
  activeSessions: z.number().int(),
  openReports: z.number().int().describe("Open reports against this person"),
  storageBytes: z.number().int().describe("Space their uploads take, processed copies included; GIFs not counted"),
  queued: z.boolean().describe("Signed up after their inviter hit the limit and can't sign in yet"),
  guest: z.boolean().describe("Joined without an invite: anonymous messages and support only"),
  inviteLimit: z.number().int(),
  invited: z.number().int().describe("People who joined with their links"),
  waiting: z.number().int().describe("People waiting for them to get a higher limit"),
  ads: z.boolean().describe("Whether they see ads"),
  storageLimitMb: z.number().int().nullable().describe("Space their uploads may take; null means no limit"),
  mapsLimit: z.number().int().nullable().describe("Calls to Google Maps they may make a month; null means only the app-wide limits"),
  mapsUsed: z.number().int().describe("Calls to Google Maps they made this month (UTC)"),
  seenBy: z
    .array(AdminUserRef)
    .optional()
    .describe("When searching an alias: the people who see this user under it"),
});
export type AdminUserDTO = z.infer<typeof AdminUserDTO>;

export const ReportedMessageDTO = z.object({
  id: Id,
  senderId: Id,
  type: MessageType,
  text: z.string().nullable(),
  entities: z.array(MessageEntity),
  attachment: AttachmentDTO.nullable().describe("Null once the file is gone; links last 5 minutes"),
  sticker: StickerDTO.nullable(),
  createdAt: IsoDate,
  reported: z.boolean().describe("The message that was reported; the others are the few around it"),
});
export type ReportedMessageDTO = z.infer<typeof ReportedMessageDTO>;

export const AdminAnonDTO = z.object({
  id: Id,
  text: z.string(),
  photoUrl: z.string().url().nullable().describe("Links last 5 minutes"),
  gifUrl: z.string().url().nullable().describe("An MP4 to play like a GIF"),
  voiceUrl: z.string().url().nullable(),
  sender: AdminUserRef,
  recipient: AdminUserRef,
  recipientAskCode: z.string().describe("The recipient's own anonymous link code, as it is now; for the URL, see askUrl"),
  createdAt: IsoDate,
  senderDeletedAt: IsoDate.nullable(),
  recipientDeletedAt: IsoDate.nullable().describe("Also set when the recipient had blocked the sender"),
});
export type AdminAnonDTO = z.infer<typeof AdminAnonDTO>;

export const AdminAnonQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional().describe("Part of the sender's or recipient's name or email"),
});
export type AdminAnonQuery = z.infer<typeof AdminAnonQuery>;

export const ReportStatus = z.enum(["open", "dismissed", "actioned"]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const ReportDTO = z.object({
  id: Id,
  reason: ReportReason,
  note: z.string().nullable(),
  status: ReportStatus,
  reporter: AdminUserRef,
  target: AdminUserRef,
  messages: z
    .array(ReportedMessageDTO)
    .describe("Copied when the report was made, so later edits or deletes don't hide it"),
  createdAt: IsoDate,
  resolvedAt: IsoDate.nullable(),
  resolution: z.string().nullable(),
});
export type ReportDTO = z.infer<typeof ReportDTO>;

export const AdminReportQuery = PageQuery.extend({ status: z.enum(["open", "resolved"]).default("open") });
export type AdminReportQuery = z.infer<typeof AdminReportQuery>;

export const ResolveReportInput = z.object({
  deleteMessage: z.boolean().optional().describe("Delete the reported message for everyone"),
  banUser: z.boolean().optional().describe("Ban the reported person"),
  banHours: BanHours,
  banScope: BanScope.default("full"),
  note: z.string().trim().max(500).optional(),
});
export type ResolveReportInput = z.infer<typeof ResolveReportInput>;

export const AdminUserQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional().describe("Matches name or email, or an alias like #EF4535"),
  banned: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type AdminUserQuery = z.infer<typeof AdminUserQuery>;

export const InviteLimitInput = z.object({ limit: z.number().int().min(0).max(100_000) });
export type InviteLimitInput = z.infer<typeof InviteLimitInput>;

export const StorageLimitInput = z.object({
  limitMb: z.number().int().min(0).max(10_000_000).nullable().describe("Null lifts the limit"),
});
export type StorageLimitInput = z.infer<typeof StorageLimitInput>;

export const MapsLimitInput = z.object({
  limit: z.number().int().min(0).max(1_000_000).nullable().describe("0 keeps them on OpenStreetMap; null lifts the cap"),
});
export type MapsLimitInput = z.infer<typeof MapsLimitInput>;

export const UserUsageDTO = z.object({
  days: z
    .array(z.object({ day: z.string(), seconds: z.number().int(), calls: z.number().int() }))
    .describe("Each day (UTC), oldest first: seconds with the app open and visible, summed over devices, and calls to the API"),
  hours: z.array(z.number().int()).length(24).describe("Seconds with the app open in each UTC hour of the day, over the whole range"),
  pages: z.array(z.object({ page: z.string(), seconds: z.number().int() })).describe("Screens, ids left out, most time first"),
  calls: z
    .array(z.object({ name: z.string(), count: z.number().int() }))
    .describe("The 40 most used REST routes (`GET /v1/chats/:id`) and socket events (`ws message:send`)"),
});
export type UserUsageDTO = z.infer<typeof UserUsageDTO>;

export const UsageQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });
export type UsageQuery = z.infer<typeof UsageQuery>;

export const SetAdsInput = z.object({ userIds: z.array(Id).min(1).max(100), ads: z.boolean() });
export type SetAdsInput = z.infer<typeof SetAdsInput>;

export const BanUserInput = z.object({
  reason: z.string().trim().min(1).max(500),
  hours: BanHours,
  scope: BanScope.default("full"),
});
export type BanUserInput = z.infer<typeof BanUserInput>;

export const AdminStickerPackDTO = z.object({
  id: Id,
  title: z.string(),
  official: z.boolean().describe("Made by an admin and in everyone's stickers"),
  owner: AdminUserRef.nullable(),
  createdAt: IsoDate,
  bannedAt: IsoDate.nullable(),
  stickers: z.array(StickerDTO),
});
export type AdminStickerPackDTO = z.infer<typeof AdminStickerPackDTO>;

export const AdminPackQuery = PageQuery.extend({
  official: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true")
    .describe("Official packs instead of the ones people made"),
});
export type AdminPackQuery = z.infer<typeof AdminPackQuery>;

export const AdminStatsDTO = z.object({
  users: z.number().int(),
  bannedUsers: z.number().int(),
  activeUsers7d: z.number().int(),
  messages: z.number().int(),
  messages24h: z.number().int(),
  openReports: z.number().int(),
  stickerPacks: z.number().int(),
  storageBytes: z.number().int().describe("Space everyone's uploads take"),
  gifCacheBytes: z.number().int().describe("Space the shared GIF copies take"),
  topStorage: z.array(z.object({ user: AdminUserRef, bytes: z.number().int() })).describe("The 10 biggest users"),
  signups: z.array(z.object({ day: z.string(), count: z.number().int() })).describe("Last 30 days, oldest first"),
});
export type AdminStatsDTO = z.infer<typeof AdminStatsDTO>;

export const AdminLargeFileDTO = z.object({
  id: Id,
  kind: UploadKind,
  name: z.string(),
  size: z.number().int(),
  owner: AdminUserRef,
  createdAt: IsoDate,
  status: UploadStatus,
});
export type AdminLargeFileDTO = z.infer<typeof AdminLargeFileDTO>;

export const MAIL_KINDS = ["poke", "inactive", "anon", "access"] as const;
export const MAIL_STATUSES = ["sent", "failed", "skipped"] as const;

export const AdminMailDTO = z.object({
  id: Id,
  kind: z.enum(MAIL_KINDS).describe("poke: someone poked them; inactive: away for a day; anon: a guest reminded to share their link; access: an admin gave them full access"),
  status: z.enum(MAIL_STATUSES).describe("skipped: mail isn't set up here, or no redirect address outside production"),
  subject: z.string(),
  to: z.string().describe("The person's address"),
  sentTo: z.string().nullable().describe("Where it actually went, when that isn't `to`: the redirect outside production"),
  error: z.string().nullable(),
  recipient: AdminUserRef.nullable().describe("Null once the account is gone"),
  sender: AdminUserRef.nullable().describe("Who poked, for pokes"),
  createdAt: IsoDate,
});
export type AdminMailDTO = z.infer<typeof AdminMailDTO>;

export const AdminMailQuery = PageQuery.extend({
  kind: z.enum(MAIL_KINDS).optional(),
  status: z.enum(MAIL_STATUSES).optional(),
  q: z.string().trim().max(100).optional().describe("Part of the recipient's name or address"),
});
export type AdminMailQuery = z.infer<typeof AdminMailQuery>;

export const AdminMailStats = z.object({
  sent: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
}).describe("The last 24 hours");
export type AdminMailStats = z.infer<typeof AdminMailStats>;

export const ImportStickersInput = z.object({ uploadId: Id.describe("A completed upload of kind `sticker_zip`") });
export type ImportStickersInput = z.infer<typeof ImportStickersInput>;

export const StickerImportDTO = z.object({
  uploadId: Id.describe("The zip's upload, which names the import"),
  updatedAt: IsoDate.describe("When the worker last reported; an import that stops moving has likely lost its worker"),
  done: z.number().int().describe("Files handled so far, added or skipped"),
  total: z.number().int(),
  current: z.string().nullable().describe("The pack being filled"),
  packs: z.array(z.string()).describe("Names of the packs made so far"),
  skipped: z.number().int().describe("Files that weren't stickers or couldn't be processed"),
  finished: z.boolean(),
  error: z.string().nullable(),
});
export type StickerImportDTO = z.infer<typeof StickerImportDTO>;

export const UnfinishedZipDTO = z
  .object({ id: Id, name: z.string(), size: z.number().int(), createdAt: IsoDate })
  .describe("A sticker zip whose upload never finished, so it was never imported");
export type UnfinishedZipDTO = z.infer<typeof UnfinishedZipDTO>;
