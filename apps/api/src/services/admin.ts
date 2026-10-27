import {
  type AddStickerInput,
  type AdminPackQuery,
  type AdminStatsDTO,
  type AdminStickerPackDTO,
  type AdminUserDTO,
  type AdminUserQuery,
  AppError,
  type CreateStickerPackInput,
} from "@six/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { isAdminEmail } from "../plugins/auth.js";
import { admitQueued, invitesOf } from "./referrals.js";
import { toUserRef } from "./reports.js";
import { revokeSession } from "./sessions.js";
import { SEEDED_PREFIX, attachSticker, isSeededPack, toStickerDTO } from "./stickers.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const activeSessions = () => ({ revokedAt: null, expiresAt: { gt: new Date() } });

const userInclude = () =>
  ({
    sessions: { where: activeSessions(), select: { lastUsedAt: true } },
    _count: { select: { memberships: true, messages: true, reportsAgainst: { where: { status: "open" } } } },
  }) satisfies Prisma.UserInclude;
type UserRow = Prisma.UserGetPayload<{ include: ReturnType<typeof userInclude> }>;

function toAdminUser(u: UserRow, storageBytes: number, invites: { invited: number; waiting: number }): AdminUserDTO {
  const lastActive = u.sessions.map((s) => s.lastUsedAt).sort((a, b) => +b - +a)[0];
  return {
    ...toUserRef(u),
    banReason: u.banReason,
    admin: isAdminEmail(u.email),
    createdAt: u.createdAt.toISOString(),
    lastActiveAt: lastActive?.toISOString() ?? null,
    chats: u._count.memberships,
    messages: u._count.messages,
    activeSessions: u.sessions.length,
    openReports: u._count.reportsAgainst,
    storageBytes,
    queued: u.queuedAt !== null,
    inviteLimit: u.inviteLimit,
    ...invites,
  };
}

/** Bytes each user's uploads take in storage, processed copies included. Shared GIF copies are left out. */
async function storageOf(userIds: string[]) {
  if (!userIds.length) return new Map<string, number>();
  const rows = await prisma.$queryRaw<{ ownerId: string; bytes: bigint }[]>`
    SELECT "ownerId", SUM(COALESCE("storedBytes", "size"))::bigint AS bytes
    FROM "Upload" WHERE "kind" <> 'gif' AND "ownerId" = ANY(${userIds}::text[]) GROUP BY 1`;
  return new Map(rows.map((r) => [r.ownerId, Number(r.bytes)]));
}

async function withTotals(rows: UserRow[]) {
  const ids = rows.map((u) => u.id);
  const [storage, invites] = await Promise.all([storageOf(ids), invitesOf(prisma, ids)]);
  return rows.map((u) => toAdminUser(u, storage.get(u.id) ?? 0, invites(u.id)));
}

export async function listUsers(q: AdminUserQuery) {
  const rows = await prisma.user.findMany({
    where: {
      ...(q.q && {
        OR: [
          { displayName: { contains: q.q, mode: "insensitive" } },
          { email: { contains: q.q, mode: "insensitive" } },
        ],
      }),
      ...(q.banned !== undefined && { bannedAt: q.banned ? { not: null } : null }),
    },
    include: userInclude(),
    ...pageArgs(q),
  });
  const page = toPage(rows, q, (u) => u);
  return { items: await withTotals(page.items), nextCursor: page.nextCursor };
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude() });
  if (!user) throw new AppError("USER_NOT_FOUND");
  return (await withTotals([user]))[0]!;
}

export async function signOutEverywhere(userId: string) {
  const sessions = await prisma.session.findMany({ where: { userId, ...activeSessions() }, select: { id: true } });
  await Promise.all(sessions.map((s) => revokeSession(s.id)));
}

/** Blocks someone from signing in and signs them out of every device. Their messages stay. */
export async function banUser(adminId: string, userId: string, reason: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("USER_NOT_FOUND");
  if (userId === adminId || isAdminEmail(user.email)) throw new AppError("FORBIDDEN", "Admins can't be banned");
  await prisma.user.update({ where: { id: userId }, data: { bannedAt: new Date(), banReason: reason } });
  await signOutEverywhere(userId);
  return getUser(userId);
}

export async function unbanUser(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { bannedAt: null, banReason: null } }).catch(() => {
    throw new AppError("USER_NOT_FOUND");
  });
  return getUser(userId);
}

/** Raising someone's limit lets in the people waiting on their links, oldest first. */
export async function setInviteLimit(userId: string, limit: number) {
  await prisma.user.update({ where: { id: userId }, data: { inviteLimit: limit } }).catch(() => {
    throw new AppError("USER_NOT_FOUND");
  });
  await admitQueued(userId);
  return getUser(userId);
}

const packInclude = {
  owner: true,
  stickers: {
    where: { removedAt: null, OR: [{ lottieUrl: { not: null } }, { upload: { status: { not: "failed" } } }] },
    include: { upload: true },
    orderBy: { position: "asc" },
  },
} satisfies Prisma.StickerPackInclude;

type PackRow = Prisma.StickerPackGetPayload<{ include: typeof packInclude }>;

const toAdminPack = (p: PackRow): AdminStickerPackDTO => ({
  id: p.id,
  title: p.title,
  official: p.builtin,
  owner: p.owner ? toUserRef(p.owner) : null,
  createdAt: p.createdAt.toISOString(),
  bannedAt: p.bannedAt?.toISOString() ?? null,
  stickers: p.stickers.map(toStickerDTO),
});

/** People's packs, or the official ones admins made (in everyone's stickers, like the built-in Noto packs). */
export async function listStickerPacks(q: AdminPackQuery) {
  const rows = await prisma.stickerPack.findMany({
    where: q.official ? { builtin: true, NOT: { id: { startsWith: SEEDED_PREFIX } } } : { builtin: false },
    include: packInclude,
    ...pageArgs(q),
  });
  return toPage(rows, q, toAdminPack);
}

export async function createOfficialPack(adminId: string, input: CreateStickerPackInput) {
  const pack = await prisma.stickerPack.create({
    data: { title: input.title, builtin: true, ownerId: adminId },
    include: packInclude,
  });
  return toAdminPack(pack);
}

export async function addOfficialSticker(adminId: string, packId: string, input: AddStickerInput) {
  const pack = await prisma.stickerPack.findUnique({ where: { id: packId } });
  if (!pack || !pack.builtin || isSeededPack(pack.id) || pack.bannedAt) throw new AppError("STICKER_PACK_NOT_FOUND");
  return attachSticker(adminId, packId, input);
}

/**
 * Takes stickers out of their pack so they can't be sent again. A moderation takedown (`ban`) also
 * blanks them in messages that already show them; tidying an official pack leaves those alone.
 */
async function takeDownStickers(where: Prisma.StickerWhereInput, ban: boolean) {
  const now = new Date();
  await prisma.sticker.updateMany({ where: { ...where, removedAt: null }, data: { removedAt: now } });
  if (ban) await prisma.sticker.updateMany({ where: { ...where, bannedAt: null }, data: { bannedAt: now } });
}

export async function banStickerPack(packId: string) {
  const pack = await prisma.stickerPack.findUnique({ where: { id: packId } });
  if (!pack || isSeededPack(pack.id)) throw new AppError("STICKER_PACK_NOT_FOUND");
  await prisma.stickerPack.update({ where: { id: packId }, data: { bannedAt: pack.bannedAt ?? new Date() } });
  await takeDownStickers({ packId }, !pack.builtin);
}

export async function banSticker(stickerId: string) {
  const sticker = await prisma.sticker.findUnique({ where: { id: stickerId }, include: { pack: true } });
  if (!sticker || isSeededPack(sticker.packId)) throw new AppError("STICKER_NOT_FOUND");
  await takeDownStickers({ id: stickerId }, !sticker.pack.builtin);
}

const total = (rows: { bytes: bigint | null }[]) => Number(rows[0]?.bytes ?? 0);

export async function adminStats(): Promise<AdminStatsDTO> {
  const now = Date.now();
  const [
    users,
    bannedUsers,
    active,
    messages,
    messages24h,
    openReports,
    stickerPacks,
    signups,
    storage,
    gifCache,
    top,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
    prisma.session.findMany({
      where: { lastUsedAt: { gt: new Date(now - 7 * DAY_MS) } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.message.count(),
    prisma.message.count({ where: { createdAt: { gt: new Date(now - DAY_MS) } } }),
    prisma.report.count({ where: { status: "open" } }),
    prisma.stickerPack.count({ where: { builtin: false, bannedAt: null } }),
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, count(*) AS count
      FROM "User" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1`,
    prisma.$queryRaw<{ bytes: bigint | null }[]>`
      SELECT SUM(COALESCE("storedBytes", "size"))::bigint AS bytes FROM "Upload" WHERE "kind" <> 'gif'`,
    prisma.$queryRaw<{ bytes: bigint | null }[]>`
      SELECT SUM("size")::bigint AS bytes
      FROM (SELECT DISTINCT ON (COALESCE("mainKey", "key")) "size" FROM "Upload" WHERE "kind" = 'gif') AS files`,
    prisma.$queryRaw<{ ownerId: string; bytes: bigint }[]>`
      SELECT "ownerId", SUM(COALESCE("storedBytes", "size"))::bigint AS bytes
      FROM "Upload" WHERE "kind" <> 'gif' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
  ]);
  const owners = new Map(
    (await prisma.user.findMany({ where: { id: { in: top.map((t) => t.ownerId) } } })).map((u) => [u.id, u]),
  );
  const byDay = new Map(signups.map((s) => [s.day, Number(s.count)]));
  const days = Array.from({ length: 30 }, (_, i) => new Date(now - (29 - i) * DAY_MS).toISOString().slice(0, 10));
  return {
    users,
    bannedUsers,
    activeUsers7d: active.length,
    messages,
    messages24h,
    openReports,
    stickerPacks,
    storageBytes: total(storage),
    gifCacheBytes: total(gifCache),
    topStorage: top.flatMap((t) => {
      const user = owners.get(t.ownerId);
      return user ? [{ user: toUserRef(user), bytes: Number(t.bytes) }] : [];
    }),
    signups: days.map((day) => ({ day, count: byDay.get(day) ?? 0 })),
  };
}
