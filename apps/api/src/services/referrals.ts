import { randomInt } from "node:crypto";
import type { Invite } from "@prisma/client";
import {
  AppError,
  type CreateInviteInput,
  type InviteDTO,
  type InvitePreview,
  type InviteStatus,
  type PageQuery,
} from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { ensureDirectChat } from "./chats.js";
import { applyOverride, loadOverrides } from "./contacts.js";
import { toPublicUser } from "./users.js";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

function generateCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function toInviteDTO(i: Invite): InviteDTO {
  return {
    code: i.code,
    maxUses: i.maxUses,
    uses: i.uses,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

function inviteStatus(i: Invite): InviteStatus {
  if (i.expiresAt && i.expiresAt < new Date()) return "expired";
  if (i.maxUses !== null && i.uses >= i.maxUses) return "exhausted";
  return "valid";
}

export async function createInvite(userId: string, input: CreateInviteInput) {
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 864e5) : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await prisma.invite.create({
        data: { code: generateCode(), creatorId: userId, maxUses: input.maxUses, expiresAt },
      });
      return toInviteDTO(invite);
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique invite code");
}

export async function listInvites(userId: string, q: PageQuery) {
  const rows = await prisma.invite.findMany({ where: { creatorId: userId }, ...pageArgs(q) });
  return toPage(rows, q, toInviteDTO);
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const invite = await prisma.invite.findUnique({ where: { code: normalizeCode(code) }, include: { creator: true } });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");
  return { code: invite.code, inviter: toPublicUser(invite.creator), status: inviteStatus(invite) };
}

export async function applyInvite(tx: Tx, emit: Emit, refereeId: string, code: string) {
  const invite = await tx.invite.findUnique({ where: { code: normalizeCode(code) } });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");
  if (invite.expiresAt && invite.expiresAt < new Date()) throw new AppError("INVITE_EXPIRED");
  if (invite.creatorId === refereeId) throw new AppError("INVITE_OWN", "You cannot use your own invite");

  const existing = await tx.referral.findUnique({ where: { refereeId } });
  if (existing) throw new AppError("ALREADY_REFERRED");

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

export async function acceptInvite(userId: string, code: string) {
  const existing = await prisma.referral.findUnique({
    where: { refereeId: userId },
    include: { referrer: true, invite: { select: { code: true } } },
  });
  if (existing?.invite.code === normalizeCode(code)) return { referrer: toPublicUser(existing.referrer) };

  const referral = await withEvents((tx, emit) => applyInvite(tx, emit, userId, code));
  return { referrer: toPublicUser(referral.referrer) };
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
