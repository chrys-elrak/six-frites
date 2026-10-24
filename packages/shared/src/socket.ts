import type {
  ChatDeliveredDTO,
  ChatReadDTO,
  MarkDeliveredInput,
  MarkReadInput,
  MessageDTO,
  SendMessageInput,
  TypingDTO,
  TypingInput,
} from "./chats.js";
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
  typing: (e: TypingDTO) => void;
  "session:revoked": (e: SocketEnvelope<{ sessionId: string }>) => void;
}

export interface ClientToServerEvents {
  ping: (p: Record<string, never>, cb: Ack<{ at: string }>) => void;
  "message:send": (p: SendMessageInput & { chatId: string }, cb: Ack<MessageDTO>) => void;
  "chat:read": (p: MarkReadInput & { chatId: string }, cb: Ack<ChatReadDTO | null>) => void;
  "chat:delivered": (p: MarkDeliveredInput & { chatId: string }, cb: Ack<ChatDeliveredDTO | null>) => void;
  "chat:typing": (p: TypingInput, cb?: Ack<null>) => void;
  /** Sent by open apps when they become visible or hidden, and every 30s while visible. */
  presence: (p: { active: boolean }) => void;
}
