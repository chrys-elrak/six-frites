import { z } from "zod";
import { Id, IsoDate, PageQuery } from "./common.js";
import { AttachmentDTO } from "./uploads.js";
import { PublicUser } from "./invites.js";
import { StickerDTO } from "./stickers.js";
import { isChatThemeId } from "./chat-themes.js";
import { EncryptedInput, EncryptionDTO } from "./e2ee.js";
import { ChatGame, GameMoveDTO } from "./games.js";

export const MessageType = z.enum([
  "text",
  "image",
  "video",
  "video_note",
  "voice",
  "file",
  "gif",
  "sticker",
  "service",
  "location",
  "checklist",
  "game",
]);
export type MessageType = z.infer<typeof MessageType>;

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional().describe("How far off it may be, in meters"),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** Opens the place in Google Maps: the app on Android, the website elsewhere. */
export const mapsUrl = (p: GeoPoint) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

export const coordsLabel = (p: GeoPoint) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

export const CHECKLIST = { title: 128, item: 200, items: 30 } as const;

/** Most photos and videos one album holds, as on Telegram. */
export const MAX_ALBUM = 10;

/**
 * Album ids for files sent together, one per file: photos and videos share an id, ten at a time;
 * anything else, or a lone photo, gets none.
 */
export function albumIds(kinds: string[], newId: () => string): (string | undefined)[] {
  const visual = (k: string) => k === "image" || k === "video";
  if (kinds.filter(visual).length < 2) return kinds.map(() => undefined);
  let id = newId();
  let count = 0;
  return kinds.map((k) => {
    if (!visual(k)) return undefined;
    if (count === MAX_ALBUM) {
      id = newId();
      count = 0;
    }
    count++;
    return id;
  });
}

export const Checklist = z.object({
  title: z.string().trim().min(1).max(CHECKLIST.title),
  items: z.array(z.string().trim().min(1).max(CHECKLIST.item)).min(1).max(CHECKLIST.items),
});
export type Checklist = z.infer<typeof Checklist>;

export const ChecklistMark = z.object({
  item: z.number().int().describe("Index in the checklist's items"),
  userId: Id.describe("Who marked it done"),
  at: IsoDate,
});
export type ChecklistMark = z.infer<typeof ChecklistMark>;

export const EntityType = z.enum(["bold", "italic", "strike", "code", "spoiler"]);
export type EntityType = z.infer<typeof EntityType>;

export const MessageEntity = z.object({
  type: EntityType,
  offset: z.number().int().min(0),
  length: z.number().int().min(1),
});
export type MessageEntity = z.infer<typeof MessageEntity>;

const Entities = z
  .array(MessageEntity)
  .max(100)
  .describe(
    "Ranges in UTF-16 code units of the trimmed text. Different types may overlap (bold inside a spoiler); ranges of the same type may not.",
  );

/** Checks that every range sits inside the text and that ranges of the same type never overlap. */
export function entitiesFit(text: string, entities: MessageEntity[] = []) {
  const byType = new Map<EntityType, MessageEntity[]>();
  for (const e of entities) {
    if (e.offset + e.length > text.length) return false;
    byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  }
  for (const ranges of byType.values()) {
    const sorted = [...ranges].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.offset < sorted[i - 1]!.offset + sorted[i - 1]!.length) return false;
    }
  }
  return true;
}

/** Replaces each spoiler range with a fixed mask so previews never reveal hidden text or its length. */
export function maskSpoilers(text: string, entities: MessageEntity[] = [], mask = "••••") {
  const spoilers = entities.filter((e) => e.type === "spoiler").sort((a, b) => a.offset - b.offset);
  let out = "";
  let cursor = 0;
  for (const e of spoilers) {
    out += text.slice(cursor, e.offset) + mask;
    cursor = e.offset + e.length;
  }
  return out + text.slice(cursor);
}

export const ReplyPreview = z.object({
  id: Id,
  senderId: Id,
  type: MessageType,
  text: z.string().nullable(),
  spoiler: z.boolean(),
  ephemeral: z.boolean(),
  deleted: z.boolean(),
  encrypted: z.boolean().describe("The quoted text is encrypted; show it from your own copy of that message"),
});
export type ReplyPreview = z.infer<typeof ReplyPreview>;

export const EphemeralInput = z
  .object({
    maxViews: z.number().int().min(1).max(10).optional().describe("Destroy after this many views by the recipient"),
    ttlSeconds: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60 * 60)
      .optional()
      .describe("Destroy this many seconds after the recipient first opens it"),
  })
  .refine((v) => v.maxViews !== undefined || v.ttlSeconds !== undefined, "Set maxViews, ttlSeconds or both");
export type EphemeralInput = z.infer<typeof EphemeralInput>;

/** How often, and for how long after it was opened, a sender can re-arm a self-destructing message. */
export const EPHEMERAL_RESEND = { max: 3, windowSeconds: 60 * 60 } as const;

export const EphemeralDTO = z.object({
  maxViews: z.number().int().nullable(),
  ttlSeconds: z.number().int().nullable(),
  views: z.number().int().describe("How many times the recipient opened it"),
  firstViewedAt: IsoDate.nullable(),
  locked: z.boolean().describe("Content is withheld for you; open it with POST /v1/messages/{id}/view"),
  expired: z.boolean().describe("Its views or timer ran out; the recipient can no longer open it"),
  purged: z.boolean().describe("Content permanently deleted; it can no longer be resent"),
  resent: z.boolean().describe("The sender re-armed it after it was opened"),
  resendsLeft: z.number().int().describe("How many more times the sender can re-arm it"),
  resendUntil: IsoDate.nullable().describe("Until when the sender can resend it, once it has been opened"),
});
export type EphemeralDTO = z.infer<typeof EphemeralDTO>;

export const ServiceAction = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("auto_delete"), secs: z.number().int().nullable() }),
    z.object({ type: z.literal("theme"), theme: z.string().nullable() }),
    z.object({ type: z.literal("e2ee") }),
    z.object({
      type: z.literal("call"),
      video: z.boolean(),
      secs: z.number().int().nullable().describe("How long it lasted; null if it was missed or declined"),
    }),
  ])
  .describe(
    "What a `service` message announces: `auto_delete` means the sender set the timer to `secs` (null: off); `theme` means they set the chat background (null: back to each person's default); `e2ee` marks where end-to-end encryption starts; `call` logs a call the sender made",
  );
export type ServiceAction = z.infer<typeof ServiceAction>;

/** Allowed range for a chat's auto-delete timer, in seconds. */
export const AUTO_DELETE = { min: 60 * 60, max: 365 * 24 * 60 * 60 } as const;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Timers offered in the auto-delete menu; any other value in range can be set as a custom one. */
export const AUTO_DELETE_PRESETS = [
  HOUR,
  8 * HOUR,
  DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  90 * DAY,
  180 * DAY,
  365 * DAY,
] as const;

/** Units for a custom auto-delete timer, in seconds. A month is 30 days, as in `durationLabel`. */
export const AUTO_DELETE_UNITS = [
  ["hours", HOUR],
  ["days", DAY],
  ["weeks", 7 * DAY],
  ["months", 30 * DAY],
] as const;

export const MUTE_PRESETS = [
  { label: "1 hour", secs: 60 * 60 },
  { label: "8 hours", secs: 8 * 60 * 60 },
  { label: "1 day", secs: 24 * 60 * 60 },
  { label: "1 week", secs: 7 * 24 * 60 * 60 },
] as const;

export const MAX_MUTE_SECS = 365 * 24 * 60 * 60;

/** Whether a chat is muted right now; a timed mute counts as over once its end has passed. */
export function isMuted(chat: { muted: boolean; mutedUntil: string | null }, now = Date.now()) {
  return chat.muted && (chat.mutedUntil === null || Date.parse(chat.mutedUntil) > now);
}

export const MessageListQuery = PageQuery.extend({
  only: z
    .enum(["media", "files", "links", "text"])
    .optional()
    .describe(
      "media: photos and videos; files; links: text messages that may hold a link (every encrypted one, since only your device can read it); text: messages that can hold text, captions included, for searching on your device. Leaves out deleted and self-destructing messages.",
    ),
  from: IsoDate.optional().describe("Only messages sent at or after this time"),
  to: IsoDate.optional().describe("Only messages sent before this time"),
  until: Id.optional().describe(
    "Ignore `limit` and keep going until this message is in the page (up to 2000 messages), to jump to it",
  ),
});
export type MessageListQuery = z.infer<typeof MessageListQuery>;

export const MessageEffect = z
  .enum(["fire", "gift", "hearts", "confetti"])
  .describe("How a text message shows: in flames, gift-wrapped until opened, or with hearts or confetti when it arrives");
export type MessageEffect = z.infer<typeof MessageEffect>;

export const MessageDTO = z.object({
  id: Id,
  chatId: Id,
  senderId: Id,
  clientId: z.string(),
  type: MessageType,
  text: z.string().nullable(),
  entities: z.array(MessageEntity),
  spoiler: z.boolean(),
  effect: MessageEffect.nullable(),
  silent: z.boolean().describe("Sent with `/silent`: it arrives without a notification or sound"),
  attachment: AttachmentDTO.nullable(),
  sticker: StickerDTO.nullable(),
  ephemeral: EphemeralDTO.nullable(),
  groupId: z.string().nullable().describe("Photos and videos sent together share it and show as one album"),
  replyTo: ReplyPreview.nullable(),
  action: ServiceAction.nullable(),
  location: GeoPoint.nullable(),
  checklist: Checklist.nullable(),
  checks: z.array(ChecklistMark).describe("The checklist items marked done; either person can tick them"),
  game: ChatGame.nullable(),
  moves: z.array(GameMoveDTO).describe("Answers to the game, oldest first; anyone but the sender can play"),
  createdAt: IsoDate,
  editedAt: IsoDate.nullable(),
  deletedAt: IsoDate.nullable(),
  deletedBy: Id.nullable().describe("Who deleted it for everyone: the sender, or the other person in a direct chat"),
  expiresAt: IsoDate.nullable().describe("When the chat's auto-delete timer removes it for everyone"),
  reactions: z
    .array(z.object({ emoji: z.string(), userIds: z.array(Id) }))
    .describe("One entry per emoji, oldest first; a person can add several different emoji"),
  encryption: EncryptionDTO.nullable().describe(
    "Set for end-to-end encrypted messages: `text`, `entities`, `spoiler` and `effect` are then empty and the content is in your device's envelope",
  ),
});
export type MessageDTO = z.infer<typeof MessageDTO>;

const MessageText = z.string().trim().min(1).max(4000);

export const EditMessageInput = z
  .object({ text: MessageText.optional(), entities: Entities.optional(), encrypted: EncryptedInput.optional() })
  .refine((v) => (v.text === undefined) !== (v.encrypted === undefined), {
    message: "Send either text or encrypted content",
    path: ["text"],
  })
  .refine((v) => !v.encrypted || v.entities === undefined, { message: "Entities go inside the encrypted content", path: ["entities"] })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), { message: "Entities fall outside the text", path: ["entities"] });
export type EditMessageInput = z.infer<typeof EditMessageInput>;

export const DeleteScope = z.enum(["me", "all"]);
export type DeleteScope = z.infer<typeof DeleteScope>;

export const DeleteMessagesQuery = z.object({
  ids: z
    .string()
    .max(4000)
    .describe("Comma-separated message ids, at most 100")
    .transform((s) => [
      ...new Set(
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ])
    .refine((ids) => ids.length >= 1 && ids.length <= 100, "Provide between 1 and 100 ids"),
  scope: DeleteScope.default("me"),
});
export type DeleteMessagesQuery = z.infer<typeof DeleteMessagesQuery>;

export const MessagesDeletedDTO = z.object({
  chatId: Id,
  messageIds: z.array(Id),
  scope: DeleteScope.describe(
    "`all`: the messages became deleted placeholders. `me`: remove them from this user's view entirely.",
  ),
  by: Id.optional().describe("With `all`: who deleted them"),
});
export type MessagesDeletedDTO = z.infer<typeof MessagesDeletedDTO>;

export const SendMessageInput = z
  .object({
    clientId: z.string().min(1).max(64),
    text: MessageText.optional().describe("Required unless attachmentId is set, in which case it is the caption"),
    entities: Entities.optional(),
    attachmentId: Id.optional().describe("A completed upload from POST /v1/uploads/{id}/complete"),
    gifId: z
      .string()
      .regex(/^[\w-]{1,128}$/)
      .optional()
      .describe("A GIF from GET /v1/gifs; the server saves a copy and attaches it"),
    stickerId: Id.optional().describe("Send this sticker, on its own"),
    location: GeoPoint.optional().describe("Share a place, on its own"),
    checklist: Checklist.optional().describe("Send a checklist, on its own"),
    game: ChatGame.optional().describe("Send a game with your move, on its own"),
    type: z
      .enum(["location", "checklist", "game"])
      .optional()
      .describe("With `encrypted`: the content is a location, a checklist or a game rather than text or a file"),
    replyToId: Id.optional(),
    groupId: z
      .string()
      .regex(/^[\w-]{1,64}$/)
      .optional()
      .describe("The same id on photos and videos sent together, so they show as one album"),
    spoiler: z.boolean().optional(),
    effect: MessageEffect.optional().describe("Only with text"),
    silent: z.boolean().optional().describe("Deliver it without a notification or sound"),
    ephemeral: EphemeralInput.optional().describe("Self-destruct after viewing, like Telegram's view-once and timers"),
    encrypted: EncryptedInput.optional(),
    sentAt: IsoDate.optional().describe(
      "When the sender pressed send, on the server's clock (measure the offset with the socket `ping`). Shown in GET /v1/messages/{id}/timing",
    ),
  })
  .refine(
    (v) =>
      v.text !== undefined ||
      v.attachmentId !== undefined ||
      v.gifId !== undefined ||
      v.stickerId ||
      v.location ||
      v.checklist ||
      v.game ||
      v.encrypted,
    { message: "Send text, an attachment, a GIF, a sticker, a location, a checklist, a game or encrypted content", path: ["text"] },
  )
  .refine(
    (v) =>
      !v.encrypted ||
      (v.text === undefined &&
        v.entities === undefined &&
        v.spoiler === undefined &&
        v.effect === undefined &&
        !v.gifId &&
        !v.stickerId &&
        !v.location &&
        !v.checklist &&
        !v.game),
    {
      message:
        "Text, entities, spoilers, locations, checklists and games go inside the encrypted content; GIFs and stickers are sent on their own",
      path: ["encrypted"],
    },
  )
  .refine((v) => !v.type || v.encrypted, { message: "`type` is only for encrypted content", path: ["type"] })
  .refine(
    (v) =>
      [v.location, v.checklist, v.game, v.type].filter(Boolean).length === 0 ||
      ([v.location, v.checklist, v.game].filter(Boolean).length <= 1 &&
        v.text === undefined &&
        !v.attachmentId &&
        !v.gifId &&
        !v.stickerId &&
        !v.ephemeral),
    { message: "Locations, checklists and games are sent on their own", path: ["location"] },
  )
  .refine((v) => [v.attachmentId, v.gifId, v.stickerId].filter((x) => x !== undefined).length <= 1, {
    message: "Send one attachment, GIF or sticker at a time",
    path: ["attachmentId"],
  })
  .refine((v) => !v.stickerId || v.text === undefined, { message: "Stickers have no caption", path: ["text"] })
  .refine((v) => !v.effect || v.text !== undefined, { message: "Effects are for text messages", path: ["effect"] })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), {
    message: "Entities fall outside the text",
    path: ["entities"],
  });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const ChatMemberDTO = z.object({
  user: PublicUser,
  lastDeliveredMessageId: Id.nullable(),
  lastDeliveredAt: IsoDate.nullable(),
  lastReadMessageId: Id.nullable(),
  lastReadAt: IsoDate.nullable(),
});
export type ChatMemberDTO = z.infer<typeof ChatMemberDTO>;

export const ChatDTO = z.object({
  id: Id,
  type: z.enum(["direct"]),
  title: z.string(),
  members: z.array(ChatMemberDTO),
  lastMessage: MessageDTO.nullable(),
  unreadCount: z.number().int(),
  archived: z.boolean(),
  muted: z.boolean(),
  mutedUntil: IsoDate.nullable().describe("When a timed mute ends; null while muted for good or not muted"),
  pinned: z.boolean(),
  safeView: z.boolean().describe("Your setting: blur the photos and videos the other person sends until you tap them"),
  sharingProfile: z
    .boolean()
    .describe("You show the other person your real name and photo; until then they only see your alias"),
  autoDeleteSecs: z
    .number()
    .int()
    .nullable()
    .describe("Shared by both people: new messages are deleted for everyone this long after they are sent"),
  theme: z
    .string()
    .nullable()
    .describe("Chat background shared by both people (an id from CHAT_THEMES); null uses each person's default"),
  scheduledCount: z.number().int().describe("Your scheduled messages waiting to be sent in this chat"),
  blockedByMe: z.boolean().describe("You blocked the other person: nobody can send, react or edit until you unblock"),
  blockedByThem: z.boolean().describe("The other person blocked you"),
  peerDeleted: z.boolean().describe("The other person deleted their account"),
  encrypted: z
    .boolean()
    .describe("Messages here are end-to-end encrypted from now on; sending plain text is refused (ENCRYPTION_REQUIRED)"),
  lastActivityAt: IsoDate,
  createdAt: IsoDate,
});
export type ChatDTO = z.infer<typeof ChatDTO>;

export const ChatListQuery = z.object({
  archived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ChatListQuery = z.infer<typeof ChatListQuery>;

export const MarkReadInput = z.object({
  messageId: Id.optional(),
});
export type MarkReadInput = z.infer<typeof MarkReadInput>;

export const MarkDeliveredInput = MarkReadInput.extend({
  at: IsoDate.optional().describe("When `messageId` reached this device, on the server's clock. Defaults to now"),
});
export type MarkDeliveredInput = z.infer<typeof MarkDeliveredInput>;

export const MessageTimingDTO = z.object({
  sentAt: IsoDate.nullable().describe("When the sender pressed send; null from older apps"),
  serverAt: IsoDate.describe("When the server stored it"),
  arrivedAt: IsoDate.nullable().describe("When it first reached a recipient's device; null until then"),
});
export type MessageTimingDTO = z.infer<typeof MessageTimingDTO>;

/** The legs of a message's trip in milliseconds, null where a time is missing. */
export function messageTrip(t: MessageTimingDTO) {
  const server = Date.parse(t.serverAt);
  const sent = t.sentAt ? Date.parse(t.sentAt) : null;
  const arrived = t.arrivedAt ? Date.parse(t.arrivedAt) : null;
  return {
    up: sent === null ? null : server - sent,
    down: arrived === null ? null : arrived - server,
    total: sent === null || arrived === null ? null : arrived - sent,
  };
}

export const latencyLabel = (ms: number) =>
  ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;

export const ChatDeliveredDTO = z.object({
  chatId: Id,
  userId: Id,
  lastDeliveredMessageId: Id,
  lastDeliveredAt: IsoDate,
});
export type ChatDeliveredDTO = z.infer<typeof ChatDeliveredDTO>;

/** What a member is busy with in the composer. Older clients leave it out, which means "text". */
export const TypingKind = z.enum(["text", "voice", "video", "photo"]);
export type TypingKind = z.infer<typeof TypingKind>;

export const TypingInput = z.object({ chatId: Id, typing: z.boolean(), kind: TypingKind.optional() });
export type TypingInput = z.infer<typeof TypingInput>;

export const TypingDTO = TypingInput.extend({ userId: Id });
export type TypingDTO = z.infer<typeof TypingDTO>;

export const ChatReadDTO = z.object({
  chatId: Id,
  userId: Id,
  lastReadMessageId: Id,
  lastReadAt: IsoDate,
});
export type ChatReadDTO = z.infer<typeof ChatReadDTO>;

export const UpdateChatInput = z
  .object({
    archived: z.boolean().optional(),
    muted: z.boolean().optional(),
    mutedUntil: IsoDate.nullable()
      .optional()
      .describe("With `muted: true`, unmute on its own at this time. Leave out or null to stay muted."),
    pinned: z.boolean().optional(),
    safeView: z.boolean().optional().describe("Just for you: blur the photos and videos the other person sends"),
    autoDeleteSecs: z
      .number()
      .int()
      .min(AUTO_DELETE.min)
      .max(AUTO_DELETE.max)
      .nullable()
      .optional()
      .describe(
        "For both people: delete messages sent from now on this many seconds after sending. null turns it off.",
      ),
    theme: z
      .string()
      .refine(isChatThemeId, "Unknown chat theme")
      .nullable()
      .optional()
      .describe("For both people: the chat background, a theme id or custom:#rrggbb. null goes back to each person's default."),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Provide at least one field");
export type UpdateChatInput = z.infer<typeof UpdateChatInput>;

export const DeleteChatQuery = z
  .object({
    scope: DeleteScope.default("me"),
    from: IsoDate.optional().describe("Only delete the messages sent from this time on, instead of the whole chat"),
    to: IsoDate.optional().describe("Only delete the messages sent up to this time, instead of the whole chat"),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "`from` must not be after `to`",
    path: ["from"],
  });
export type DeleteChatQuery = z.infer<typeof DeleteChatQuery>;

/** "Delete chat" shortcuts for the messages sent in the last hour, day or week. */
export const DELETE_RANGE_PRESETS = [
  { label: "deleteLastHour", secs: 3600 },
  { label: "deleteLastDay", secs: 86400 },
  { label: "deleteLastWeek", secs: 7 * 86400 },
] as const;

/** DeleteChatQuery's `from` and `to` covering two whole local days and every day between, in either order. */
export function dayRange(a: Date, b: Date) {
  const [first, last] = a <= b ? [a, b] : [b, a];
  const from = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1, 0, 0, 0, -1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const ChatDeletedDTO = z.object({ chatId: Id, scope: DeleteScope });
export type ChatDeletedDTO = z.infer<typeof ChatDeletedDTO>;

/** Offered in the quick reaction bar; any other single emoji can be picked too. */
export const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"] as const;

export const ReactionEmoji = z
  .string()
  .max(32)
  .regex(
    /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]|\u200D\p{Extended_Pictographic})*)$/u,
    "Expected a single emoji",
  );

export const MessageReactedDTO = z.object({
  chatId: Id,
  messageId: Id,
  userId: Id.describe("Who reacted"),
  emoji: z.string(),
});
export type MessageReactedDTO = z.infer<typeof MessageReactedDTO>;

/** How many different emoji one person can put on one message. */
export const MAX_REACTIONS_PER_USER = 10;

export const ReactInput = z.object({ emoji: ReactionEmoji });
export type ReactInput = z.infer<typeof ReactInput>;

export const CheckItemInput = z.object({ done: z.boolean() });
export type CheckItemInput = z.infer<typeof CheckItemInput>;

export const ViewMessageResult = z.object({
  message: MessageDTO,
  expiresAt: IsoDate.nullable().describe("When the content will be destroyed, if a timer is running"),
});
export type ViewMessageResult = z.infer<typeof ViewMessageResult>;

/** How many messages one person can have waiting in a chat, and how far ahead they can be scheduled. */
export const SCHEDULE_LIMITS = { perChat: 100, maxAheadSeconds: 365 * 24 * 60 * 60 } as const;

export const ScheduleMessageInput = SendMessageInput.safeExtend({
  sendAt: IsoDate.describe("When to send it, in the future and at most a year ahead"),
}).refine((v) => !v.game && v.type !== "game", { message: "Games are played now, not scheduled", path: ["game"] });
export type ScheduleMessageInput = z.infer<typeof ScheduleMessageInput>;

export const ScheduledMessageDTO = z.object({
  id: Id,
  chatId: Id,
  clientId: z.string().describe("Becomes the clientId of the message once it is sent"),
  type: MessageType,
  text: z.string().nullable(),
  entities: z.array(MessageEntity),
  spoiler: z.boolean(),
  attachment: AttachmentDTO.nullable(),
  ephemeral: z.object({ maxViews: z.number().int().nullable(), ttlSeconds: z.number().int().nullable() }).nullable(),
  replyTo: ReplyPreview.nullable(),
  sendAt: IsoDate,
  createdAt: IsoDate,
  encryption: EncryptionDTO.nullable(),
});
export type ScheduledMessageDTO = z.infer<typeof ScheduledMessageDTO>;

export const EditScheduledInput = z
  .object({
    text: MessageText.optional(),
    entities: Entities.optional().describe("Replaces the formatting; send it together with text"),
    encrypted: EncryptedInput.optional().describe("Replaces the encrypted content of an encrypted scheduled message"),
    sendAt: IsoDate.optional(),
  })
  .refine(
    (v) => v.text !== undefined || v.encrypted !== undefined || v.sendAt !== undefined,
    "Provide text or encrypted content, sendAt, or both",
  )
  .refine((v) => v.text === undefined || v.encrypted === undefined, {
    message: "Send either text or encrypted content",
    path: ["encrypted"],
  })
  .refine((v) => v.text !== undefined || v.entities === undefined, {
    message: "Send entities together with text",
    path: ["entities"],
  })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), {
    message: "Entities fall outside the text",
    path: ["entities"],
  });
export type EditScheduledInput = z.infer<typeof EditScheduledInput>;
