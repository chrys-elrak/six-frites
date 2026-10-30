import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { ZodError, z } from "zod";
import {
  type Ack,
  type AckResult,
  AppError,
  CallSignalInput,
  CreateLiveInput,
  LiveBotInput,
  LiveMoveInput,
  LiveRoomRef,
  MarkDeliveredInput,
  MarkReadInput,
  SendMessageInput,
  TypingInput,
} from "@six/shared";
import { env } from "../env.js";
import { setUserPresence } from "../lib/presence.js";
import { blockedWith } from "../services/blocks.js";
import { prisma } from "../lib/prisma.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { redisConnection } from "../lib/queue.js";
import { type IO, rooms, setIo, socketKey } from "../lib/realtime.js";
import { authenticateBearer } from "../plugins/auth.js";
import { relaySignal } from "../services/calls.js";
import { createRoom, joinRoom, leaveRoom, playMove, setBot, startRoom } from "../services/live.js";
import { markDelivered, markRead } from "../services/chats.js";
import { assertMember, sendMessage } from "../services/messages.js";

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
  const pub = redisConnection();
  const io: IO = new Server(http, {
    cors: { origin: env.WEB_ORIGIN.split(","), credentials: true },
    adapter: createAdapter(pub, pub.duplicate(), { key: socketKey }),
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

    socket.on("presence", (p) => {
      const active = typeof p === "object" && p !== null && (p as { active?: unknown }).active === true;
      void setUserPresence(userId, sessionId, active).catch(() => null);
    });
    socket.on("disconnect", () => void setUserPresence(userId, sessionId, false).catch(() => null));

    socket.on(
      "message:send",
      handle((p) => sendMessage(userId, ChatRef.parse(p).chatId, SendMessageInput.parse(p), sessionId)),
    );

    socket.on(
      "call:signal",
      handle((p) => relaySignal(userId, sessionId, CallSignalInput.parse(p))),
    );

    socket.on("live:create", handle((p) => createRoom(userId, CreateLiveInput.parse(p))));
    socket.on("live:join", handle((p) => joinRoom(userId, LiveRoomRef.parse(p).roomId)));
    socket.on("live:leave", handle(async (p) => leaveRoom(userId, LiveRoomRef.parse(p).roomId) ?? null));
    socket.on(
      "live:bot",
      handle(async (p) => {
        const { roomId, add } = LiveBotInput.parse(p);
        return setBot(userId, roomId, add);
      }),
    );
    socket.on("live:start", handle(async (p) => startRoom(userId, LiveRoomRef.parse(p).roomId)));
    socket.on(
      "live:move",
      handle(async (p) => {
        const { roomId, move } = LiveMoveInput.parse(p);
        return playMove(userId, roomId, move);
      }),
    );

    socket.on(
      "chat:read",
      handle((p) => markRead(userId, ChatRef.parse(p).chatId, MarkReadInput.parse(p))),
    );

    socket.on(
      "chat:delivered",
      handle((p) => markDelivered(userId, ChatRef.parse(p).chatId, MarkDeliveredInput.parse(p))),
    );

    socket.on(
      "chat:typing",
      handle(async (p) => {
        const { chatId, typing, kind } = TypingInput.parse(p);
        await assertMember(prisma, chatId, userId);
        const blocked = await blockedWith(prisma, userId);
        const others = (
          await prisma.chatMember.findMany({ where: { chatId, userId: { not: userId } }, select: { userId: true } })
        ).filter((m) => !blocked.has(m.userId));
        if (others.length) {
          io.to(others.map((m) => rooms.user(m.userId))).emit("typing", { chatId, userId, typing, kind });
        }
        return null;
      }),
    );
  });

  setIo(io);
  return io;
}
