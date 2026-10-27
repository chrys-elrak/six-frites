import type { Invite } from "../generated/prisma/client.js";
import {
  AppError,
  type CreateInviteInput,
  type InviteDTO,
  type InvitePreview,
  type InviteStatus,
  type PageQuery,
} from "@six/shared";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { ensureDirectChat } from "./chats.js";
import { applyOverride, loadOverrides } from "./contacts.js";
import { toPublicUser } from "./users.js";

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

export async function createInvite(userId: string, input: CreateInviteInput) {
  const expiresAt = new Date(Date.now() + input.expiresInDays * 864e5);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await prisma.invite.create({
        data: { code: generateCode(), creatorId: userId, message: input.message || null, maxUses: input.maxUses, expiresAt },
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

export async function listInvites(userId: string, q: PageQuery) {
  const rows = await prisma.invite.findMany({ where: { creatorId: userId }, ...pageArgs(q) });
  return toPage(rows, q, toInviteDTO);
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const invite = await prisma.invite.findUnique({ where: { code: normalizeCode(code) }, include: { creator: true } });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");
  return {
    code: invite.code,
    inviter: toPublicUser(invite.creator),
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

/** Labels a new account with the link it signed up with, takes one of the link's places and connects both people. */
export async function applyInvite(tx: Tx, emit: Emit, refereeId: string, code: string) {
  const invite = await usableInvite(tx, code, refereeId);

  const claimed = await tx.invite.updateMany({
    where: { id: invite.id, ...(invite.maxUses !== null && { uses: { lt: invite.maxUses } }) },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count === 0) throw new AppError("INVITE_EXHAUSTED");

  const referral = await tx.referral.create({
    data: { inviteId: invite.id, referrerId: invite.creatorId, refereeId },
    include: { referrer: true },
  });
  await ensureDirectChat(tx, emit, invite.creatorId, refereeId);
  return referral;
}

/** Connects someone who already has an account with the link's owner. It doesn't take one of the link's places. */
export async function acceptInvite(userId: string, code: string) {
  const existing = await prisma.referral.findUnique({
    where: { refereeId: userId },
    include: { referrer: true, invite: { select: { code: true } } },
  });
  if (existing?.invite.code === normalizeCode(code)) return { referrer: toPublicUser(existing.referrer) };

  return withEvents(async (tx, emit) => {
    const invite = await usableInvite(tx, code, userId);
    await ensureDirectChat(tx, emit, invite.creatorId, userId);
    return { referrer: toPublicUser(invite.creator) };
  });
}

export async function listReferrals(userId: string, q: PageQuery) {
  const rows = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: { referee: true, invite: { select: { code: true } } },
    ...pageArgs(q),
  });
  const overrides = await loadOverrides(prisma, userId, rows.map((r) => r.refereeId));
  return toPage(rows, q, (r) => ({
    id: r.id,
    user: applyOverride(toPublicUser(r.referee), overrides.get(r.refereeId)),
    inviteCode: r.invite.code,
    createdAt: r.createdAt.toISOString(),
  }));
}
