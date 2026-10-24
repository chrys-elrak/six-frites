import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "@prisma/client";
import { AppError, type AuthResult, type DeviceInfo, type GoogleLoginInput } from "@six/shared";
import { type GoogleVerifier, verifyGoogleIdToken } from "../lib/google.js";
import { prisma } from "../lib/prisma.js";
import {
  REFRESH_TTL_SECS,
  newRefreshToken,
  parseRefreshToken,
  signAccessToken,
} from "../lib/tokens.js";
import { applyInvite } from "./referrals.js";
import { revokeSession } from "./sessions.js";
import { toUserDTO } from "./users.js";

export interface IssuedAuth extends Omit<AuthResult, "refreshToken"> {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const refreshExpiry = () => new Date(Date.now() + REFRESH_TTL_SECS * 1000);

async function issueAccess(userId: string, sessionId: string) {
  const access = await signAccessToken({ userId, sessionId });
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString() };
}

export async function loginWithGoogle(
  input: GoogleLoginInput,
  verify: GoogleVerifier = verifyGoogleIdToken,
): Promise<IssuedAuth> {
  const identity = await verify(input.idToken);

  const { user, session, refresh } = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { googleSub: identity.sub } });
    const user =
      existing ??
      (await tx.user.create({
        data: {
          googleSub: identity.sub,
          email: identity.email,
          displayName: identity.name,
          avatarUrl: identity.picture,
        },
      }));

    if (input.inviteCode && !existing) await applyInvite(tx, user.id, input.inviteCode);

    const session = await createSession(tx, user.id, input.device);
    return { user, ...session };
  });

  return {
    ...(await issueAccess(user.id, session.id)),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: session.expiresAt,
    user: toUserDTO(user),
  };
}

async function createSession(
  tx: Prisma.TransactionClient,
  userId: string,
  device: DeviceInfo,
) {
  const id = createId();
  const refresh = newRefreshToken(id);
  const session = await tx.session.create({
    data: {
      id,
      userId,
      platform: device.platform,
      deviceName: device.name ?? null,
      refreshTokenHash: refresh.hash,
      expiresAt: refreshExpiry(),
    },
  });
  return { session, refresh };
}

/**
 * Rotates the refresh token. Presenting a token that was already rotated means it leaked,
 * so the whole session is revoked and every holder (legitimate or not) must sign in again.
 */
export async function refreshSession(refreshToken: string): Promise<IssuedAuth> {
  const { sessionId, hash } = parseRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session) throw new AppError("INVALID_REFRESH_TOKEN");
  if (session.revokedAt || session.expiresAt < new Date()) throw new AppError("SESSION_REVOKED");

  if (session.refreshTokenHash !== hash) {
    await revokeSession(session.id);
    throw new AppError("REFRESH_TOKEN_REUSED", "Refresh token reuse detected; session revoked");
  }

  const next = newRefreshToken(session.id);
  const expiresAt = refreshExpiry();
  const rotated = await prisma.session.updateMany({
    where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
    data: { refreshTokenHash: next.hash, lastUsedAt: new Date(), expiresAt },
  });
  if (rotated.count === 0) {
    await revokeSession(session.id);
    throw new AppError("REFRESH_TOKEN_REUSED", "Refresh token reuse detected; session revoked");
  }

  return {
    ...(await issueAccess(session.userId, session.id)),
    refreshToken: next.token,
    refreshTokenExpiresAt: expiresAt,
    user: toUserDTO(session.user),
  };
}

export async function logout(sessionId: string) {
  await revokeSession(sessionId);
}
