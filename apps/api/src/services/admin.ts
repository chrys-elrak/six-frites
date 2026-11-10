import {
  FRITE_BOT_ID,
  type AddStickerInput,
  type AdminCodeInput,
  type AdminLargeFileDTO,
  type AdminPackQuery,
  type AdminStatsDTO,
  type AdminStickerPackDTO,
  type AdminUserDTO,
  type AdminUserQuery,
  type BanScope,
  AppError,
  type CreateStickerPackInput,
  ENCRYPT_MAX_BYTES,
  type PageQuery,
  type UploadKind,
  type UploadStatus,
} from "@six/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects } from "../lib/storage.js";
import { matchTotp, newTotpSecret, totpUri } from "../lib/totp.js";
import { adminTwoFactor, isAdminEmail } from "../plugins/auth.js";
import { emailFullAccess } from "./emails.js";
import { notify } from "./notifications.js";
import { admitQueued, grantFullAccess, invitesOf } from "./referrals.js";
import { toUserRef } from "./reports.js";
import { revokeSession } from "./sessions.js";
import { SEEDED_PREFIX, attachSticker, isSeededPack, toStickerDTO } from "./stickers.js";
import { finishUpload, storageOf, uploadKeys } from "./uploads.js";
import { toUserDTO } from "./users.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A secret for an admin who has no authenticator yet; nothing is saved until a code made from it is entered. */
export async function newAdminSecret(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpSecret: true } });
  if (user.totpSecret) throw new AppError("CONFLICT", "An authenticator is already set up");
  const secret = newTotpSecret();
  return { secret, uri: totpUri(secret, user.email) };
}

/**
 * Opens moderation on this session for a valid authenticator code. The first code also saves the secret it was
 * made from. A code is spent once used, so one seen over a shoulder can't open another session.
 */
export async function verifyAdminCode(userId: string, sessionId: string, { code, secret }: AdminCodeInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecret: true, totpStep: true } });
  const key = user.totpSecret ?? secret;
  if (!key) throw new AppError("VALIDATION_FAILED", "Set up an authenticator first");
  const step = matchTotp(key, code);
  const wrong = new AppError("WRONG_2FA_CODE", "That code didn't work");
  if (step === null || (user.totpStep !== null && step <= user.totpStep)) throw wrong;
  const spent = await prisma.user.updateMany({
    where: { id: userId, totpSecret: user.totpSecret, totpStep: user.totpStep },
    data: { totpSecret: key, totpStep: step },
  });
  if (!spent.count) throw wrong;
  await prisma.session.update({ where: { id: sessionId }, data: { adminVerifiedAt: new Date() } });
  return { admin: true as const, twoFactor: await adminTwoFactor(sessionId) };
}

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
    guest: u.guest,
    inviteLimit: u.inviteLimit,
    ...invites,
    ads: !u.adsDisabled,
    storageLimitMb: u.storageLimitMb,
  };
}

async function withTotals(rows: UserRow[]) {
  const ids = rows.map((u) => u.id);
  const [storage, invites] = await Promise.all([storageOf(ids), invitesOf(prisma, ids)]);
  return rows.map((u) => toAdminUser(u, storage.get(u.id) ?? 0, invites(u.id)));
}

const ALIAS = /^(?:potato\s*)?#([0-9a-f]{6})$/i;

/** The people someone sees under `alias`, each with everyone who sees them that way. */
async function usersBehind(alias: string) {
  const pairs = await prisma.$queryRaw<{ viewerId: string; userId: string }[]>`
    SELECT DISTINCT me."userId" AS "viewerId", cm."userId"
    FROM "ChatMember" me
    JOIN "ChatMember" cm ON cm."chatId" = me."chatId" AND cm."userId" <> me."userId"
    WHERE pair_alias(me."userId", cm."userId") = ${alias}`;
  const [rows, viewers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: pairs.map((p) => p.userId) } }, include: userInclude() }),
    prisma.user.findMany({ where: { id: { in: pairs.map((p) => p.viewerId) } } }),
  ]);
  const refs = new Map(viewers.map((v) => [v.id, toUserRef(v)]));
  return (await withTotals(rows)).map((u) => ({
    ...u,
    seenBy: pairs.filter((p) => p.userId === u.id).map((p) => refs.get(p.viewerId)!),
  }));
}

export async function listUsers(q: AdminUserQuery) {
  const alias = q.q?.match(ALIAS)?.[1];
  if (alias) return { items: await usersBehind(`#${alias.toUpperCase()}`), nextCursor: null };
  const rows = await prisma.user.findMany({
    where: {
      id: { not: FRITE_BOT_ID },
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

const UNBANNED = { bannedAt: null, banReason: null, bannedUntil: null, banScope: "full" };

/**
 * Bans someone for `hours` or until lifted. A full ban keeps them from signing in and signs them out everywhere; a
 * chat ban leaves them their anonymous messages and support, and their open apps switch over at once. Their
 * messages stay.
 */
export async function banUser(adminId: string, userId: string, reason: string, hours?: number, scope: BanScope = "full") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("USER_NOT_FOUND");
  if (userId === adminId || isAdminEmail(user.email)) throw new AppError("FORBIDDEN", "Admins can't be banned");
  const bannedUntil = hours ? new Date(Date.now() + hours * 3_600_000) : null;
  await withEvents(async (tx, emit) => {
    const banned = await tx.user.update({
      where: { id: userId },
      data: { bannedAt: new Date(), banReason: reason, bannedUntil, banScope: scope },
    });
    emit(userId, "me.updated", toUserDTO(banned));
  });
  if (scope === "full") await signOutEverywhere(userId);
  return getUser(userId);
}

/** Lifts the timed bans that have run out; the timers sweep calls it. */
export async function liftExpiredBans() {
  const { count } = await prisma.user.updateMany({ where: { bannedUntil: { lte: new Date() } }, data: UNBANNED });
  return count;
}

export async function unbanUser(userId: string) {
  await withEvents(async (tx, emit) => {
    const user = await tx.user.update({ where: { id: userId }, data: UNBANNED }).catch(() => {
      throw new AppError("USER_NOT_FOUND");
    });
    emit(userId, "me.updated", toUserDTO(user));
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

export async function setStorageLimit(userId: string, limitMb: number | null) {
  await prisma.user.update({ where: { id: userId }, data: { storageLimitMb: limitMb } }).catch(() => {
    throw new AppError("USER_NOT_FOUND");
  });
  return getUser(userId);
}

/** Lets a guest or someone on the waiting list all the way in, and tells them in the app and by email. */
export async function giveFullAccess(userId: string) {
  const granted = await withEvents(async (tx, emit) => {
    const user = await grantFullAccess(tx, emit, userId);
    if (user) await notify(tx, emit, { userId, actorId: null, kind: "full_access" });
    return user;
  });
  if (granted) void emailFullAccess(userId);
  return getUser(userId);
}

/** Turns ads on or off for these people; their open apps pick it up at once. */
export async function setAds(userIds: string[], ads: boolean) {
  await withEvents(async (tx, emit) => {
    await tx.user.updateMany({ where: { id: { in: userIds } }, data: { adsDisabled: !ads } });
    for (const u of await tx.user.findMany({ where: { id: { in: userIds } } })) emit(u.id, "me.updated", toUserDTO(u));
  });
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

/**
 * Deletes an official pack for good, with its stickers and their files, when none of them was ever sent; one that
 * shows in a chat can only be taken down, so the message keeps its sticker.
 */
export async function deleteOfficialPack(packId: string) {
  const pack = await prisma.stickerPack.findUnique({
    where: { id: packId },
    include: { stickers: { include: { upload: true, _count: { select: { messages: true } } } } },
  });
  if (!pack || !pack.builtin || isSeededPack(pack.id)) throw new AppError("STICKER_PACK_NOT_FOUND");
  if (pack.stickers.some((s) => s._count.messages > 0)) {
    throw new AppError("STICKER_PACK_IN_USE", "Some of its stickers were sent in chats; take the pack down instead");
  }
  const uploads = pack.stickers.flatMap((s) => (s.upload ? [s.upload] : []));
  await prisma.stickerPack.delete({ where: { id: packId } });
  await prisma.upload.deleteMany({ where: { id: { in: uploads.map((u) => u.id) } } });
  await deleteObjects(uploads.flatMap(uploadKeys)).catch(() => null);
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

/** Files over 100 MB, which go up unencrypted, newest first. */
export async function listLargeFiles(q: PageQuery) {
  const rows = await prisma.upload.findMany({
    where: { size: { gt: ENCRYPT_MAX_BYTES } },
    include: { owner: true },
    ...pageArgs(q),
  });
  return toPage(
    rows,
    q,
    (u): AdminLargeFileDTO => ({
      id: u.id,
      kind: u.kind as UploadKind,
      name: u.name,
      size: u.size,
      owner: toUserRef(u.owner),
      createdAt: u.createdAt.toISOString(),
      status: u.status as UploadStatus,
    }),
  );
}

/** Deletes a large file from storage; messages that carried it say it was removed. */
export async function removeLargeFile(uploadId: string) {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.size <= ENCRYPT_MAX_BYTES) throw new AppError("UPLOAD_NOT_FOUND");
  if (upload.status === "removed") return;
  if (upload.status !== "ready" && upload.status !== "failed") {
    throw new AppError("UPLOAD_NOT_READY", "Wait until it has finished uploading and processing");
  }
  await finishUpload(uploadId, { status: "removed", storedBytes: 0 });
  await deleteObjects(uploadKeys(upload));
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
    prisma.user.count({ where: { id: { not: FRITE_BOT_ID } } }),
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
      FROM "User" WHERE "createdAt" > now() - interval '30 days' AND "id" <> ${FRITE_BOT_ID} GROUP BY 1`,
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
