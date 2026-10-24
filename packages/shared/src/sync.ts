import { z } from "zod";
import { ChatDTO, ChatDeletedDTO, ChatReadDTO, MessageDTO, MessagesDeletedDTO } from "./chats.js";

const event = <T extends string, D extends z.ZodTypeAny>(type: T, data: D) =>
  z.object({ eventId: z.string(), type: z.literal(type), data, createdAt: z.string() });

export const ChangeEventDTO = z.discriminatedUnion("type", [
  event("message.new", MessageDTO),
  event("message.edited", MessageDTO),
  event("message.deleted", MessagesDeletedDTO),
  event("chat.updated", ChatDTO),
  event("chat.read", ChatReadDTO),
  event("chat.deleted", ChatDeletedDTO),
]);
export type ChangeEventDTO = z.infer<typeof ChangeEventDTO>;
export type ChangeEventType = ChangeEventDTO["type"];
export type ChangeEventData<T extends ChangeEventType> = Extract<ChangeEventDTO, { type: T }>["data"];

export const SyncQuery = z.object({
  since: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type SyncQuery = z.infer<typeof SyncQuery>;

export const SyncResult = z.object({
  events: z.array(ChangeEventDTO),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type SyncResult = z.infer<typeof SyncResult>;
