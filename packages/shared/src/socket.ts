import type { ErrorBody } from "./errors.js";

export type Ack<T> = (res: { ok: true; data: T } | ({ ok: false } & ErrorBody)) => void;

export interface SocketEnvelope<T> {
  eventId: string;
  data: T;
}

export interface ServerToClientEvents {
  "session:revoked": (e: SocketEnvelope<{ sessionId: string }>) => void;
}

export interface ClientToServerEvents {
  ping: (p: Record<string, never>, cb: Ack<{ at: string }>) => void;
}
