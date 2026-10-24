import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@six/shared";

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

let io: IO | null = null;

export function setIo(server: IO) {
  io = server;
}

export function getIo() {
  return io;
}

export const rooms = {
  user: (id: string) => `user:${id}`,
  session: (id: string) => `session:${id}`,
};
