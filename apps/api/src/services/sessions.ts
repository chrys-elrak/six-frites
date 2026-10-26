import type { Session } from "../generated/prisma/client.js";
import { AppError, type Platform, type SessionDTO } from "@six/shared";
import { prisma } from "../lib/prisma.js";
import { getIo, rooms } from "../lib/realtime.js";
import { dropDevice } from "./devices.js";

function toSessionDTO(s: Session, currentId: string): SessionDTO {
  return {
    id: s.id,
    platform: s.platform as Platform,
    deviceName: s.deviceName,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    current: s.id === currentId,
  };
}

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
  return sessions.map((s) => toSessionDTO(s, currentSessionId));
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await dropDevice(sessionId);
  const io = getIo();
  if (io) {
    const room = rooms.session(sessionId);
    io.to(room).emit("session:revoked", { eventId: "0", data: { sessionId } });
    io.in(room).disconnectSockets(true);
  }
}

export async function revokeUserSession(userId: string, sessionId: string) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new AppError("SESSION_NOT_FOUND");
  await revokeSession(sessionId);
}

export async function revokeOtherSessions(userId: string, keepSessionId: string) {
  const others = await prisma.session.findMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    select: { id: true },
  });
  await Promise.all(others.map((s) => revokeSession(s.id)));
  return others.length;
}

export async function assertSessionActive(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError("SESSION_REVOKED");
  }
  return session;
}
