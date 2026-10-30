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
import type { CallSignalDTO, CallSignalInput } from "./calls.js";
import type { ErrorBody } from "./errors.js";
import type { CreateLiveInput, LiveInviteDTO, LiveRoomDTO } from "./live.js";
import type { PresenceDTO } from "./presence.js";
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
  /** A contact came online or went offline. */
  presence: (e: PresenceDTO) => void;
  "session:revoked": (e: SocketEnvelope<{ sessionId: string }>) => void;
  /** Call signalling for this device. */
  "call:signal": (e: CallSignalDTO) => void;
  /** A live game room I'm in changed. */
  "live:room": (room: LiveRoomDTO) => void;
  /** A contact asks me to join their live game. */
  "live:invite": (invite: LiveInviteDTO) => void;
  /** The room was closed, or the server restarted and lost it. */
  "live:closed": (e: { roomId: string }) => void;
}

export interface ClientToServerEvents {
  ping: (p: Record<string, never>, cb: Ack<{ at: string }>) => void;
  "message:send": (p: SendMessageInput & { chatId: string }, cb: Ack<MessageDTO>) => void;
  "chat:read": (p: MarkReadInput & { chatId: string }, cb: Ack<ChatReadDTO | null>) => void;
  "chat:delivered": (p: MarkDeliveredInput & { chatId: string }, cb: Ack<ChatDeliveredDTO | null>) => void;
  "chat:typing": (p: TypingInput, cb?: Ack<null>) => void;
  /** Sent by open apps when they become visible or hidden, and every 30s while visible. */
  presence: (p: { active: boolean }) => void;
  "call:signal": (p: CallSignalInput, cb: Ack<{ delivered: number }>) => void;
  "live:create": (p: CreateLiveInput, cb: Ack<LiveRoomDTO>) => void;
  /** Takes an invited seat, or comes back to my own after a reconnect. */
  "live:join": (p: { roomId: string }, cb: Ack<LiveRoomDTO>) => void;
  "live:leave": (p: { roomId: string }, cb?: Ack<null>) => void;
  /** The host adds or removes a Frite Bot seat in the lobby. */
  "live:bot": (p: { roomId: string; add: boolean }, cb: Ack<LiveRoomDTO>) => void;
  /** The host starts the game, or a rematch once it's over. */
  "live:start": (p: { roomId: string }, cb: Ack<LiveRoomDTO>) => void;
  "live:move": (p: { roomId: string; move: unknown }, cb: Ack<null>) => void;
}
