import { Emitter } from "@socket.io/redis-emitter";
import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@six/shared";
import { env } from "../env.js";
import { redisConnection } from "./queue.js";

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/** Redis channel shared by the Socket.IO adapter (API) and emitter (other processes). */
export const socketKey = `${env.QUEUE_PREFIX}:socket.io`;

let io: IO | null = null;
let emitter: Emitter<ServerToClientEvents> | null = null;

export function setIo(server: IO | null) {
  io = server;
}

export function getIo() {
  return io;
}

/**
 * Where to push events to clients. Inside the API that is its own Socket.IO server (whose Redis
 * adapter forwards to other API instances); in the media worker, which has no sockets, events are
 * published through Redis and delivered by the API.
 */
export function broadcaster() {
  if (io) return io;
  emitter ??= new Emitter<ServerToClientEvents>(redisConnection(), { key: socketKey });
  return emitter;
}

export const rooms = {
  user: (id: string) => `user:${id}`,
  session: (id: string) => `session:${id}`,
};
