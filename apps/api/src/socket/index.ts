import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { ZodError, z } from "zod";
import { type Ack, type AckResult, AppError, MarkReadInput, SendMessageInput } from "@six/shared";
import { env } from "../env.js";
import { type IO, rooms, setIo } from "../lib/realtime.js";
import { authenticateBearer } from "../plugins/auth.js";
import { markRead } from "../services/chats.js";
import { sendMessage } from "../services/messages.js";

declare module "socket.io" {
  interface SocketData {
    userId: string;
    sessionId: string;
  }
}

const ChatRef = z.object({ chatId: z.string().min(1) });

export async function safe<T>(fn: () => Promise<T>): Promise<AckResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, ...err.toBody() };
    if (err instanceof ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid payload", details: err.issues } };
    }
    return { ok: false, error: { code: "INTERNAL", message: "Internal server error" } };
  }
}

function handle<T>(fn: (payload: unknown) => Promise<T>) {
  return async (payload: unknown, cb?: Ack<T>) => {
    const result = await safe(() => fn(payload));
    if (typeof cb === "function") cb(result);
  };
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
    const { userId, sessionId } = socket.data;
    socket.join([rooms.user(userId), rooms.session(sessionId)]);

    socket.on("ping", handle(async () => ({ at: new Date().toISOString() })));

    socket.on(
      "message:send",
      handle((p) => sendMessage(userId, ChatRef.parse(p).chatId, SendMessageInput.parse(p))),
    );

    socket.on(
      "chat:read",
      handle((p) => markRead(userId, ChatRef.parse(p).chatId, MarkReadInput.parse(p))),
    );
  });

  setIo(io);
  return io;
}
