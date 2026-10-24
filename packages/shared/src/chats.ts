import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { PublicUser } from "./invites.js";

export const MessageType = z.enum(["text"]);
export type MessageType = z.infer<typeof MessageType>;

export const ReplyPreview = z.object({
  id: Id,
  senderId: Id,
  type: MessageType,
  text: z.string().nullable(),
  deleted: z.boolean(),
});
export type ReplyPreview = z.infer<typeof ReplyPreview>;

export const MessageDTO = z.object({
  id: Id,
  chatId: Id,
  senderId: Id,
  clientId: z.string(),
  type: MessageType,
  text: z.string().nullable(),
  replyTo: ReplyPreview.nullable(),
  createdAt: IsoDate,
  editedAt: IsoDate.nullable(),
  deletedAt: IsoDate.nullable(),
});
export type MessageDTO = z.infer<typeof MessageDTO>;

const MessageText = z.string().trim().min(1).max(4000);

export const EditMessageInput = z.object({ text: MessageText });
export type EditMessageInput = z.infer<typeof EditMessageInput>;

export const DeleteScope = z.enum(["me", "all"]);
export type DeleteScope = z.infer<typeof DeleteScope>;

export const DeleteMessagesQuery = z.object({
  ids: z
    .string()
    .max(4000)
    .describe("Comma-separated message ids, at most 100")
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))])
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

export const SendMessageInput = z.object({
  clientId: z.string().min(1).max(64),
  text: MessageText,
  replyToId: Id.optional(),
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
  autoDeleteSecs: z.number().int().nullable(),
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
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Provide at least one field");
export type UpdateChatInput = z.infer<typeof UpdateChatInput>;

export const DeleteChatQuery = z.object({ scope: DeleteScope.default("me") });
export type DeleteChatQuery = z.infer<typeof DeleteChatQuery>;

export const ChatDeletedDTO = z.object({ chatId: Id, scope: DeleteScope });
export type ChatDeletedDTO = z.infer<typeof ChatDeletedDTO>;
