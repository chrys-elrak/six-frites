import type { Prisma } from "@prisma/client";
import { AppError } from "@six/shared";

export async function applyInvite(tx: Prisma.TransactionClient, refereeId: string, code: string) {
  const invite = await tx.invite.findUnique({ where: { code } });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");
  if (invite.expiresAt && invite.expiresAt < new Date()) throw new AppError("INVITE_EXPIRED");
  if (invite.creatorId === refereeId) throw new AppError("FORBIDDEN", "You cannot use your own invite");

  const existing = await tx.referral.findUnique({ where: { refereeId } });
  if (existing) throw new AppError("ALREADY_REFERRED");

  const claimed = await tx.invite.updateMany({
    where: { id: invite.id, ...(invite.maxUses !== null && { uses: { lt: invite.maxUses } }) },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count === 0) throw new AppError("INVITE_EXHAUSTED");

  return tx.referral.create({
    data: { inviteId: invite.id, referrerId: invite.creatorId, refereeId },
  });
}
