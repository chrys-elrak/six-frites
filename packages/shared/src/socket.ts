import type { ChatReadDTO, MarkReadInput, MessageDTO, SendMessageInput } from "./chats.js";
import type { ErrorBody } from "./errors.js";
import type { ChangeEventDTO } from "./sync.js";

export type AckResult<T> = { ok: true; data: T } | ({ ok: false } & ErrorBody);
export type Ack<T> = (res: AckResult<T>) => void;

export interface SocketEnvelope<T> {
  eventId: string;
  data: T;
}

export interface ServerToClientEvents {
  change: (e: ChangeEventDTO) => void;
  "session:revoked": (e: SocketEnvelope<{ sessionId: string }>) => void;
}

export interface ClientToServerEvents {
  ping: (p: Record<string, never>, cb: Ack<{ at: string }>) => void;
  "message:send": (p: SendMessageInput & { chatId: string }, cb: Ack<MessageDTO>) => void;
  "chat:read": (p: MarkReadInput & { chatId: string }, cb: Ack<ChatReadDTO | null>) => void;
}
