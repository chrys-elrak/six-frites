import type { Invite, User } from "../generated/prisma/client.js";
import {
  AppError,
  type CreateInviteInput,
  type InviteDTO,
  type InvitePreview,
  type InviteQuota,
  type InviteStatus,
  type PageQuery,
} from "@six/shared";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { isAdminEmail } from "../plugins/auth.js";
import { ensureDirectChat, getChat } from "./chats.js";
import { profilesFor } from "./contacts.js";
import { toPublicUser, toUserDTO } from "./users.js";

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function toInviteDTO(i: Invite): InviteDTO {
  return {
    code: i.code,
    message: i.message,
    maxUses: i.maxUses,
    uses: i.uses,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    status: inviteStatus(i),
    createdAt: i.createdAt.toISOString(),
  };
}

function inviteStatus(i: Invite): InviteStatus {
  if (i.revokedAt) return "revoked";
  if (i.expiresAt && i.expiresAt < new Date()) return "expired";
  if (i.maxUses !== null && i.uses >= i.maxUses) return "exhausted";
  return "valid";
}

/**
 * A link for `maxUses` new accounts, taken from what my invite limit has left: everyone who joined with my
 * links counts, and so does every place my working links still hold, so ten links for one person each, or
 * one for ten, fill the same limit. Locks my row so two links can't both take the last places.
 */
export async function createInvite(userId: string, input: CreateInviteInput) {
  const expiresAt = new Date(Date.now() + input.expiresInDays * 864e5);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const q = await quotaOf(tx, userId);
        if (q.limit !== null && input.maxUses > q.limit - q.invited - q.waiting - q.held) {
          throw new AppError("INVITE_LIMIT_REACHED", "Your links can't bring in that many more people");
        }
        return tx.invite.create({
          data: { code: generateCode(), creatorId: userId, message: input.message || null, maxUses: input.maxUses, expiresAt },
        });
      });
      return toInviteDTO(invite);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique invite code");
}

export async function revokeInvite(userId: string, code: string) {
  const invite = await prisma.invite.findUnique({ where: { code: normalizeCode(code) } });
  if (invite?.creatorId !== userId) throw new AppError("INVITE_NOT_FOUND");
  if (invite.revokedAt) return toInviteDTO(invite);
  return toInviteDTO(await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } }));
}

/** Takes a revoked, expired or used-up link off your list. Whoever joined with it stays, and still counts. */
export async function hideInvite(userId: string, code: string) {
  const invite = await prisma.invite.findUnique({ where: { code: normalizeCode(code) } });
  if (invite?.creatorId !== userId) throw new AppError("INVITE_NOT_FOUND");
  if (inviteStatus(invite) === "valid") throw new AppError("CONFLICT", "Revoke the link before deleting it");
  await prisma.invite.update({ where: { id: invite.id }, data: { hiddenAt: new Date() } });
}

export async function listInvites(userId: string, q: PageQuery) {
  const rows = await prisma.invite.findMany({ where: { creatorId: userId, hiddenAt: null }, ...pageArgs(q) });
  return toPage(rows, q, toInviteDTO);
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const invite = await prisma.invite.findUnique({ where: { code: normalizeCode(code) }, include: { creator: true } });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");
  return {
    code: invite.code,
    inviter: toPublicUser(invite.creator, invite.code, false),
    message: invite.message,
    status: inviteStatus(invite),
  };
}

async function usableInvite(tx: Tx, code: string, userId: string) {
  const invite = await tx.invite.findUnique({ where: { code: normalizeCode(code) }, include: { creator: true } });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");
  if (invite.creatorId === userId) throw new AppError("INVITE_OWN", "You cannot use your own invite");
  const status = inviteStatus(invite);
  if (status === "revoked") throw new AppError("INVITE_REVOKED");
  if (status === "expired") throw new AppError("INVITE_EXPIRED");
  if (status === "exhausted") throw new AppError("INVITE_EXHAUSTED");
  return invite;
}

/** How many people each user brought in with their links, and how many are waiting on their limit. */
export async function invitesOf(db: Tx, userIds: string[]) {
  const rows = userIds.length
    ? await db.$queryRaw<{ referrerId: string; invited: bigint; waiting: bigint }[]>`
        SELECT r."referrerId",
          count(*) FILTER (WHERE u."queuedAt" IS NULL) AS invited,
          count(*) FILTER (WHERE u."queuedAt" IS NOT NULL) AS waiting
        FROM "Referral" r JOIN "User" u ON u.id = r."refereeId"
        WHERE r."referrerId" = ANY(${userIds}::text[]) GROUP BY 1`
    : [];
  const byId = new Map(rows.map((r) => [r.referrerId, { invited: Number(r.invited), waiting: Number(r.waiting) }]));
  return (id: string) => byId.get(id) ?? { invited: 0, waiting: 0 };
}

/** Places left under someone's invite limit. Locks their row so two sign-ups can't both take the last one. */
async function roomLeft(tx: Tx, referrer: User) {
  if (isAdminEmail(referrer.email)) return Infinity;
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${referrer.id} FOR UPDATE`;
  const { inviteLimit } = await tx.user.findUniqueOrThrow({ where: { id: referrer.id }, select: { inviteLimit: true } });
  return inviteLimit - (await invitesOf(tx, [referrer.id]))(referrer.id).invited;
}

async function quotaOf(db: Tx, userId: string): Promise<InviteQuota> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const working = await db.invite.findMany({
    where: { creatorId: userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { maxUses: true, uses: true },
  });
  const limit = isAdminEmail(user.email) ? null : user.inviteLimit;
  const held = working.reduce((n, i) => n + (i.maxUses === null ? (limit ?? 0) : Math.max(0, i.maxUses - i.uses)), 0);
  return { limit, held, ...(await invitesOf(db, [userId]))(userId) };
}

export const inviteQuota = (userId: string) => quotaOf(prisma, userId);

/**
 * Labels a new account with the link it signed up with and takes one of the link's places. If the link's
 * owner has already brought in as many people as their limit allows, the account waits in line until an
 * admin raises it; otherwise both people are connected.
 */
export async function applyInvite(tx: Tx, emit: Emit, referee: User, code: string) {
  const invite = await usableInvite(tx, code, referee.id);

  const claimed = await tx.invite.updateMany({
    where: { id: invite.id, ...(invite.maxUses !== null && { uses: { lt: invite.maxUses } }) },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count === 0) throw new AppError("INVITE_EXHAUSTED");

  const room = await roomLeft(tx, invite.creator);
  await tx.referral.create({ data: { inviteId: invite.id, referrerId: invite.creatorId, refereeId: referee.id } });
  if (room <= 0) return tx.user.update({ where: { id: referee.id }, data: { queuedAt: new Date() } });
  await ensureDirectChat(tx, emit, invite.creatorId, referee.id, { to: invite.creatorId, kind: "joined" });
  return referee.guest ? welcomeGuest(tx, emit, referee.id) : referee;
}

/** A guest from the support page joins: their support chats become ordinary chats, on every member's screen. */
async function welcomeGuest(tx: Tx, emit: Emit, userId: string) {
  const user = await tx.user.update({ where: { id: userId }, data: { guest: false } });
  emit(userId, "me.updated", toUserDTO(user));
  const chats = await tx.chatMember.findMany({
    where: { userId },
    select: { chat: { select: { id: true, members: { select: { userId: true } } } } },
  });
  for (const { chat } of chats) {
    for (const m of chat.members) emit(m.userId, "chat.updated", await getChat(m.userId, chat.id, tx));
  }
  return user;
}

/**
 * An admin lets someone all the way in: off the waiting list (meeting whoever invited them) and out of guest mode.
 * Returns null when they already had full access, so nobody is told twice.
 */
export async function grantFullAccess(tx: Tx, emit: Emit, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { referredBy: { select: { referrerId: true } } } });
  if (!user || user.deletedAt) throw new AppError("USER_NOT_FOUND");
  if (!user.guest && !user.queuedAt) return null;
  if (user.queuedAt) {
    await tx.user.update({ where: { id: userId }, data: { queuedAt: null } });
    const referrerId = user.referredBy?.referrerId;
    if (referrerId) await ensureDirectChat(tx, emit, referrerId, userId, { to: referrerId, kind: "joined" });
  }
  return welcomeGuest(tx, emit, userId);
}

/** Lets in the people waiting on someone's links, first come first served, while they have room. */
export async function admitQueued(referrerId: string) {
  await withEvents(async (tx, emit) => {
    const room = await roomLeft(tx, await tx.user.findUniqueOrThrow({ where: { id: referrerId } }));
    if (room <= 0) return;
    const waiting = await tx.referral.findMany({
      where: { referrerId, referee: { queuedAt: { not: null } } },
      orderBy: { createdAt: "asc" },
      ...(Number.isFinite(room) && { take: room }),
    });
    for (const r of waiting) {
      const admitted = await tx.user.update({ where: { id: r.refereeId }, data: { queuedAt: null } });
      await ensureDirectChat(tx, emit, referrerId, r.refereeId, { to: referrerId, kind: "joined" });
      if (admitted.guest) await welcomeGuest(tx, emit, r.refereeId);
    }
  });
}

/**
 * Connects someone who already has an account with the link's owner. It doesn't take one of the link's places,
 * unless they are a guest from the support page, who joins with it as a new account would.
 */
export async function acceptInvite(userId: string, code: string) {
  const existing = await prisma.referral.findUnique({
    where: { refereeId: userId },
    include: { referrer: true, invite: { select: { code: true } } },
  });
  if (existing?.invite.code === normalizeCode(code)) {
    return { referrer: (await profilesFor(prisma, userId, [existing.referrerId]))(existing.referrer) };
  }

  return withEvents(async (tx, emit) => {
    const invite = await usableInvite(tx, code, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.guest && !user.queuedAt) await applyInvite(tx, emit, user, code);
    else await ensureDirectChat(tx, emit, invite.creatorId, userId, { to: invite.creatorId, kind: "added" });
    return { referrer: (await profilesFor(tx, userId, [invite.creatorId]))(invite.creator) };
  });
}

export async function listReferrals(userId: string, q: PageQuery) {
  const rows = await prisma.referral.findMany({
    where: { referrerId: userId, referee: { queuedAt: null } },
    include: { referee: true, invite: { select: { code: true } } },
    ...pageArgs(q),
  });
  const shown = await profilesFor(prisma, userId, rows.map((r) => r.refereeId));
  return toPage(rows, q, (r) => ({
    id: r.id,
    user: shown(r.referee),
    inviteCode: r.invite.code,
    createdAt: r.createdAt.toISOString(),
  }));
}
