import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { AppError, type Ack } from "@six/shared";
import { env } from "../env.js";
import { type IO, rooms, setIo } from "../lib/realtime.js";
import { authenticateBearer } from "../plugins/auth.js";

declare module "socket.io" {
  interface SocketData {
    userId: string;
    sessionId: string;
  }
}

export async function safe<T>(fn: () => Promise<T>): Promise<Parameters<Ack<T>>[0]> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, ...err.toBody() };
    return { ok: false, error: { code: "INTERNAL", message: "Internal server error" } };
  }
}

export function createSocketServer(http: HttpServer) {
  const io: IO = new Server(http, {
    cors: { origin: env.WEB_ORIGIN.split(","), credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const claims = await authenticateBearer(typeof token === "string" ? `Bearer ${token}` : undefined);
      socket.data.userId = claims.userId;
      socket.data.sessionId = claims.sessionId;
      next();
    } catch (err) {
      const e = err instanceof AppError ? err : new AppError("UNAUTHENTICATED");
      next(Object.assign(new Error(e.message), { data: e.toBody() }));
    }
  });

  io.on("connection", (socket) => {
    socket.join([rooms.user(socket.data.userId), rooms.session(socket.data.sessionId)]);
    socket.on("ping", async (_p, cb) => cb(await safe(async () => ({ at: new Date().toISOString() }))));
  });

  setIo(io);
  return io;
}
