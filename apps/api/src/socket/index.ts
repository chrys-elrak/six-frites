import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { ZodError, z } from "zod";
import {
  type Ack,
  type AckResult,
  AppError,
  CallSignalInput,
  ClientDevice,
  CreateLiveInput,
  LiveBotInput,
  LiveMoveInput,
  LiveRoomRef,
  LiveReactInput,
  LiveSayInput,
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
import { createRoom, endRoom, dropStalled, giveUp, hasRoom, joinRoom, leaveRoom, leaveSoloRooms, myRooms, playMove, react, say, setBot, startRoom, waitForTurn } from "../services/live.js";
import { markDelivered, markRead } from "../services/chats.js";
import { assertMember, sendMessage } from "../services/messages.js";

declare module "socket.io" {
  interface SocketData {
    userId: string;
    sessionId: string;
    device: ClientDevice | null;
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

/** What each live room event does, given who sent it and its payload. */
const liveActions = {
  "live:join": (userId: string, p: unknown) => joinRoom(userId, LiveRoomRef.parse(p).roomId),
  "live:leave": async (userId: string, p: unknown) => leaveRoom(userId, LiveRoomRef.parse(p).roomId) ?? null,
  "live:bot": async (userId: string, p: unknown) => {
    const { roomId, add } = LiveBotInput.parse(p);
    return setBot(userId, roomId, add);
  },
  "live:start": async (userId: string, p: unknown) => startRoom(userId, LiveRoomRef.parse(p).roomId),
  "live:giveup": async (userId: string, p: unknown) => giveUp(userId, LiveRoomRef.parse(p).roomId),
  "live:end": async (userId: string, p: unknown) => endRoom(userId, LiveRoomRef.parse(p).roomId) ?? null,
  "live:wait": async (userId: string, p: unknown) => waitForTurn(userId, LiveRoomRef.parse(p).roomId),
  "live:drop": async (userId: string, p: unknown) => dropStalled(userId, LiveRoomRef.parse(p).roomId),
  "live:say": (userId: string, p: unknown) => say(userId, LiveSayInput.parse(p)),
  "live:react": async (userId: string, p: unknown) => react(userId, LiveReactInput.parse(p)),
  "live:move": async (userId: string, p: unknown) => {
    const { roomId, move } = LiveMoveInput.parse(p);
    return playMove(userId, roomId, move);
  },
};
type LiveEvent = keyof typeof liveActions;

/** Runs a live room event here, or null when the room is on another API instance. */
async function liveHere(event: LiveEvent, userId: string, p: unknown) {
  const ref = LiveRoomRef.safeParse(p);
  if (ref.success && !hasRoom(ref.data.roomId)) return null;
  return safe<unknown>(() => liveActions[event](userId, p));
}

/**
 * Runs a live room event on the API instance holding the room. Rooms live in one process's memory and
 * the players can be connected to different instances, so when it isn't here the others are asked.
 */
async function liveAnywhere(io: IO, event: LiveEvent, userId: string, p: unknown): Promise<AckResult<unknown>> {
  const here = await liveHere(event, userId, p);
  if (here) return here;
  const there = await io.serverSideEmitWithAck("live", event, userId, p).catch(() => []);
  return there.find((res) => res !== null) ?? { ok: false, ...new AppError("ROOM_NOT_FOUND", "This game has ended").toBody() };
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
      socket.data.device = ClientDevice.safeParse(socket.handshake.auth?.device).data ?? null;
      next();
    } catch (err) {
      const e = err instanceof AppError ? err : new AppError("UNAUTHENTICATED");
      next(Object.assign(new Error(e.message), { data: e.toBody() }));
    }
  });

  io.on("live", (event, userId, p, ack) => {
    if (event in liveActions) void liveHere(event as LiveEvent, userId, p).then(ack);
    else ack(null);
  });
  io.on("live:mine", (userId, ack) => ack(myRooms(userId)));

  io.on("connection", (socket) => {

    const { userId, sessionId, device } = socket.data;
    socket.join([rooms.user(userId), rooms.session(sessionId)]);

    socket.on("ping", handle(async () => ({ at: new Date().toISOString() })));

    socket.on("presence", (p) => {
      const active = typeof p === "object" && p !== null && (p as { active?: unknown }).active === true;
      void setUserPresence(userId, sessionId, device, active).catch(() => null);
    });
    socket.on("disconnect", () => {
      void setUserPresence(userId, sessionId, device, false).catch(() => null);
      void io
        .in(rooms.user(userId))
        .fetchSockets()
        .then((left) => !left.length && leaveSoloRooms(userId))
        .catch(() => null);
    });

    socket.on(
      "message:send",
      handle((p) => sendMessage(userId, ChatRef.parse(p).chatId, SendMessageInput.parse(p), sessionId)),
    );

    socket.on(
      "call:signal",
      handle((p) => relaySignal(userId, sessionId, CallSignalInput.parse(p))),
    );

    socket.on("live:create", handle((p) => createRoom(userId, CreateLiveInput.parse(p))));
    const live =
      <T>(event: LiveEvent) =>
      async (p: unknown, cb?: Ack<T>) => {
        const res = await liveAnywhere(io, event, userId, p);
        if (typeof cb === "function") cb(res as AckResult<T>);
      };
    socket.on("live:join", live("live:join"));
    socket.on("live:leave", live("live:leave"));
    socket.on("live:bot", live("live:bot"));
    socket.on("live:start", live("live:start"));
    socket.on("live:giveup", live("live:giveup"));
    socket.on("live:end", live("live:end"));
    socket.on("live:wait", live("live:wait"));
    socket.on("live:drop", live("live:drop"));
    socket.on("live:say", live("live:say"));
    socket.on("live:react", live("live:react"));
    socket.on("live:move", live("live:move"));
    socket.on(
      "live:mine",
      handle(async () => {
        const elsewhere = await io.serverSideEmitWithAck("live:mine", userId).catch(() => []);
        return [...myRooms(userId), ...elsewhere.flat()];
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
