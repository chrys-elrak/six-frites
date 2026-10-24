import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { AttachmentDTO } from "./uploads.js";
import { PublicUser } from "./invites.js";
import { StickerDTO } from "./stickers.js";
import { isChatThemeId } from "./chat-themes.js";

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
]);
export type MessageType = z.infer<typeof MessageType>;

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
  resendsLeft: z.number().int().describe("How many more times the sender can re-arm it"),
  resendUntil: IsoDate.nullable().describe("Until when the sender can resend it, once it has been opened"),
});
export type EphemeralDTO = z.infer<typeof EphemeralDTO>;

export const ServiceAction = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("auto_delete"), secs: z.number().int().nullable() }),
    z.object({ type: z.literal("theme"), theme: z.string().nullable() }),
  ])
  .describe(
    "What a `service` message announces: `auto_delete` means the sender set the timer to `secs` (null: off); `theme` means they set the chat background (null: back to each person's default)",
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

export const MessageDTO = z.object({
  id: Id,
  chatId: Id,
  senderId: Id,
  clientId: z.string(),
  type: MessageType,
  text: z.string().nullable(),
  entities: z.array(MessageEntity),
  spoiler: z.boolean(),
  attachment: AttachmentDTO.nullable(),
  sticker: StickerDTO.nullable(),
  ephemeral: EphemeralDTO.nullable(),
  replyTo: ReplyPreview.nullable(),
  action: ServiceAction.nullable(),
  createdAt: IsoDate,
  editedAt: IsoDate.nullable(),
  deletedAt: IsoDate.nullable(),
  expiresAt: IsoDate.nullable().describe("When the chat's auto-delete timer removes it for everyone"),
  reactions: z
    .array(z.object({ emoji: z.string(), userIds: z.array(Id) }))
    .describe("One entry per emoji, oldest first; a person can add several different emoji"),
});
export type MessageDTO = z.infer<typeof MessageDTO>;

const MessageText = z.string().trim().min(1).max(4000);

export const EditMessageInput = z
  .object({ text: MessageText, entities: Entities.optional() })
  .refine((v) => entitiesFit(v.text, v.entities), { message: "Entities fall outside the text", path: ["entities"] });
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
      .regex(/^\w{1,64}$/)
      .optional()
      .describe("A GIF from GET /v1/gifs; the server saves a copy and attaches it"),
    stickerId: Id.optional().describe("Send this sticker, on its own"),
    replyToId: Id.optional(),
    spoiler: z.boolean().optional(),
    ephemeral: EphemeralInput.optional().describe("Self-destruct after viewing, like Telegram's view-once and timers"),
  })
  .refine((v) => v.text !== undefined || v.attachmentId !== undefined || v.gifId !== undefined || v.stickerId, {
    message: "Send text, an attachment, a GIF or a sticker",
    path: ["text"],
  })
  .refine((v) => [v.attachmentId, v.gifId, v.stickerId].filter((x) => x !== undefined).length <= 1, {
    message: "Send one attachment, GIF or sticker at a time",
    path: ["attachmentId"],
  })
  .refine((v) => !v.stickerId || v.text === undefined, { message: "Stickers have no caption", path: ["text"] })
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
  pinned: z.boolean(),
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

export const MarkDeliveredInput = MarkReadInput;
export type MarkDeliveredInput = MarkReadInput;

export const ChatDeliveredDTO = z.object({
  chatId: Id,
  userId: Id,
  lastDeliveredMessageId: Id,
  lastDeliveredAt: IsoDate,
});
export type ChatDeliveredDTO = z.infer<typeof ChatDeliveredDTO>;

export const TypingInput = z.object({ chatId: Id, typing: z.boolean() });
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
    pinned: z.boolean().optional(),
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

export const DeleteChatQuery = z.object({ scope: DeleteScope.default("me") });
export type DeleteChatQuery = z.infer<typeof DeleteChatQuery>;

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

export const ViewMessageResult = z.object({
  message: MessageDTO,
  expiresAt: IsoDate.nullable().describe("When the content will be destroyed, if a timer is running"),
});
export type ViewMessageResult = z.infer<typeof ViewMessageResult>;

/** How many messages one person can have waiting in a chat, and how far ahead they can be scheduled. */
export const SCHEDULE_LIMITS = { perChat: 100, maxAheadSeconds: 365 * 24 * 60 * 60 } as const;

export const ScheduleMessageInput = SendMessageInput.safeExtend({
  sendAt: IsoDate.describe("When to send it, in the future and at most a year ahead"),
}).refine((v) => !v.stickerId, { message: "Stickers can't be scheduled", path: ["stickerId"] });
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
});
export type ScheduledMessageDTO = z.infer<typeof ScheduledMessageDTO>;

export const EditScheduledInput = z
  .object({
    text: MessageText.optional(),
    entities: Entities.optional().describe("Replaces the formatting; send it together with text"),
    sendAt: IsoDate.optional(),
  })
  .refine((v) => v.text !== undefined || v.sendAt !== undefined, "Provide text, sendAt or both")
  .refine((v) => v.text !== undefined || v.entities === undefined, {
    message: "Send entities together with text",
    path: ["entities"],
  })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), {
    message: "Entities fall outside the text",
    path: ["entities"],
  });
export type EditScheduledInput = z.infer<typeof EditScheduledInput>;
