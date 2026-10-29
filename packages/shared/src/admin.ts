import { z } from "zod";
import { Id, IsoDate, PageQuery } from "./common.js";
import { MessageEntity, MessageType } from "./chats.js";
import { StickerDTO } from "./stickers.js";
import { AttachmentDTO, UploadKind, UploadStatus } from "./uploads.js";

export const ReportReason = z.enum(["spam", "harassment", "sexual", "violence", "illegal", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;

export const CreateReportInput = z
  .object({
    messageId: Id.optional().describe("Report this message (and its sender)"),
    userId: Id.optional().describe("Report this person, someone you share a chat with"),
    reason: ReportReason,
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => (v.messageId === undefined) !== (v.userId === undefined), "Report either a message or a person");
export type CreateReportInput = z.infer<typeof CreateReportInput>;

export const AdminUserRef = z.object({
  id: Id,
  displayName: z.string(),
  email: z.string(),
  avatarUrl: z.string().url().nullable(),
  bannedAt: IsoDate.nullable(),
});
export type AdminUserRef = z.infer<typeof AdminUserRef>;

export const AdminUserDTO = AdminUserRef.extend({
  banReason: z.string().nullable(),
  admin: z.boolean(),
  createdAt: IsoDate,
  lastActiveAt: IsoDate.nullable(),
  chats: z.number().int(),
  messages: z.number().int(),
  activeSessions: z.number().int(),
  openReports: z.number().int().describe("Open reports against this person"),
  storageBytes: z.number().int().describe("Space their uploads take, processed copies included; GIFs not counted"),
  queued: z.boolean().describe("Signed up after their inviter hit the limit and can't sign in yet"),
  inviteLimit: z.number().int(),
  invited: z.number().int().describe("People who joined with their links"),
  waiting: z.number().int().describe("People waiting for them to get a higher limit"),
  ads: z.boolean().describe("Whether they see ads"),
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
  note: z.string().trim().max(500).optional(),
});
export type ResolveReportInput = z.infer<typeof ResolveReportInput>;

export const AdminUserQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional().describe("Matches name or email, or an alias like Frite 0327"),
  banned: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type AdminUserQuery = z.infer<typeof AdminUserQuery>;

export const InviteLimitInput = z.object({ limit: z.number().int().min(0).max(100_000) });
export type InviteLimitInput = z.infer<typeof InviteLimitInput>;

export const SetAdsInput = z.object({ userIds: z.array(Id).min(1).max(100), ads: z.boolean() });
export type SetAdsInput = z.infer<typeof SetAdsInput>;

export const BanUserInput = z.object({ reason: z.string().trim().min(1).max(500) });
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
