import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import {
  APP_ACCOUNT_IDS,
  type ApproveLinkInput,
  AppError,
  type AuthResult,
  type DeviceInfo,
  type GoogleLoginInput,
  type LinkTicket,
  Platform,
  facebookOnly,
} from "@six/shared";
import { env } from "../env.js";
import type { User } from "../generated/prisma/client.js";
import { type Tx, withEvents } from "../lib/events.js";
import { type FirebaseIdentity, type FirebaseVerifier, verifyFirebaseIdToken } from "../lib/firebase.js";
import { type GoogleVerifier, verifyGoogleIdToken } from "../lib/google.js";
import { prisma } from "../lib/prisma.js";
import { isAdminEmail } from "../plugins/auth.js";
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

/**
 * Refuses a fully banned user, saying until when; a timed ban that just ran out no longer counts, before the sweep
 * lifts it. A chat ban lets them in, to their anonymous messages only.
 */
function checkBan({ bannedAt, bannedUntil, banScope }: Pick<User, "bannedAt" | "bannedUntil" | "banScope">) {
  if (!bannedAt || banScope === "chat" || (bannedUntil && bannedUntil <= new Date())) return;
  throw new AppError("ACCOUNT_BANNED", "This account has been banned", { until: bannedUntil?.toISOString() ?? null });
}

/** Refuses a browser or phone that a banned account signed in on, so a fresh account there doesn't get round the ban. */
async function checkDeviceBan(db: Tx, deviceId: string | null | undefined, email: string) {
  if (!deviceId || isAdminEmail(email)) return;
  const banned = await db.user.findFirst({
    where: {
      bannedAt: { not: null },
      banScope: "full",
      OR: [{ bannedUntil: null }, { bannedUntil: { gt: new Date() } }],
      sessions: { some: { deviceId } },
    },
    select: { bannedAt: true, bannedUntil: true, banScope: true },
  });
  if (banned) checkBan(banned);
}

export async function loginWithGoogle(
  input: GoogleLoginInput,
  verify: GoogleVerifier = verifyGoogleIdToken,
): Promise<IssuedAuth> {
  const { sub, ...google } = await verify(input.idToken);
  return signIn({ ...google, uid: null, googleSub: sub, providers: ["google"], emailVerified: true }, input);
}

export async function loginWithFirebase(
  input: GoogleLoginInput,
  verify: FirebaseVerifier = verifyFirebaseIdToken,
): Promise<IssuedAuth> {
  return signIn(await verify(input.idToken), input);
}

/**
 * Finds who signed in by their Firebase account, then their Google account (so everyone who joined before Firebase
 * keeps theirs), then their email, and notes the accounts it didn't know yet.
 *
 * A Facebook sign-in, whose email nobody verified, only gets back into an account opened with Facebook alone, and
 * only by its Firebase account: Firebase hands that account to whoever later signs in with Google or Apple on the
 * same address, and a Facebook token from before then still checks out for an hour. When Google or Apple vouch for
 * the address of an account only Facebook has, they take it over the way Firebase does, and everyone else is signed
 * out of it: whoever opened it may have been a stranger sitting on the real owner's address.
 */
async function findAccount(tx: Tx, { uid, googleSub, providers, email, emailVerified }: Identity) {
  const known =
    (uid && (await tx.user.findUnique({ where: { firebaseUid: uid } }))) ||
    (emailVerified && googleSub && (await tx.user.findUnique({ where: { googleSub } })));
  const user = known || (await tx.user.findUnique({ where: { email } }));
  if (!user) return null;
  const unclaimed = facebookOnly(user.providers);
  if (emailVerified && unclaimed && !facebookOnly(providers)) {
    const others = await tx.session.findMany({ where: { userId: user.id, revokedAt: null }, select: { id: true } });
    await Promise.all(others.map((s) => revokeSession(s.id)));
    return tx.user.update({ where: { id: user.id }, data: { firebaseUid: uid, googleSub, providers } });
  }
  if (!emailVerified && !(known && unclaimed && facebookOnly(providers))) {
    throw new AppError("EMAIL_TAKEN", "This email already has an account; sign in the way you did the first time");
  }
  const newProviders = providers.filter((p) => !user.providers.includes(p));
  if ((!uid || user.firebaseUid) && (!googleSub || user.googleSub) && !newProviders.length) return user;
  return tx.user.update({
    where: { id: user.id },
    data: {
      firebaseUid: user.firebaseUid ?? uid,
      googleSub: user.googleSub ?? googleSub,
      providers: [...user.providers, ...newProviders],
    },
  });
}

type Identity = FirebaseIdentity | (Omit<FirebaseIdentity, "uid"> & { uid: null });

/**
 * A new account opens on an email its provider verified, or on Facebook's, which Firebase never calls verified. The
 * real owner of that address takes such an account over when they sign in with Google or Apple (see findAccount),
 * and it can't be opened on an admin's address.
 */
async function signIn(identity: Identity, input: GoogleLoginInput): Promise<IssuedAuth> {
  const signedIn = await withEvents(async (tx, emit) => {
    const existing = await findAccount(tx, identity);
    if (!existing && !identity.emailVerified && (!facebookOnly(identity.providers) || isAdminEmail(identity.email))) {
      throw new AppError("EMAIL_REQUIRED", "This account's email isn't verified");
    }
    if (existing) checkBan(existing);
    await checkDeviceBan(tx, input.device.id, identity.email);
    const guest = existing
      ? existing.guest && !input.inviteCode
      : !input.inviteCode && env.INVITE_ONLY && !isAdminEmail(identity.email);
    if (guest && !input.guest) {
      throw new AppError("INVITE_REQUIRED", "Sign up with an invite link from someone already on Six Frites");
    }
    if (!existing && !isAdminEmail(identity.email) && (await tx.user.count({ where: { deletedAt: null, id: { notIn: APP_ACCOUNT_IDS } } })) >= env.MAX_USERS) {
      throw new AppError("SIGNUPS_CLOSED", "Six Frites is full, new accounts are closed for now");
    }
    let user =
      existing ??
      (await tx.user.create({
        data: {
          firebaseUid: identity.uid,
          googleSub: identity.googleSub,
          providers: identity.providers,
          email: identity.email,
          displayName: identity.name,
          avatarUrl: identity.picture,
          guest,
        },
      }));

    const joining = !existing || (existing.guest && !existing.queuedAt);
    if (input.inviteCode && joining) user = await applyInvite(tx, emit, user, input.inviteCode);
    if (user.queuedAt) return null;

    const session = await createSession(tx, user.id, input.device);
    return { user, ...session };
  });
  if (!signedIn) throw new AppError("ACCOUNT_QUEUED", "You're on the waiting list and will be let in soon");
  const { user, session, refresh } = signedIn;

  return {
    ...(await issueAccess(user.id, session.id)),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: session.expiresAt,
    user: toUserDTO(user),
  };
}

async function createSession(
  tx: Tx,
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
      deviceId: device.id ?? null,
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
  try {
    checkBan(session.user);
    await checkDeviceBan(prisma, session.deviceId, session.user.email);
  } catch (err) {
    await revokeSession(session.id);
    throw err;
  }

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

const LINK_TTL_MS = 2 * 60 * 1000;
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest();

/** Starts signing in a computer from a phone: the computer shows the ticket, with its own one-time key, as a QR code. */
export async function startLink(device: DeviceInfo): Promise<LinkTicket> {
  await prisma.deviceLink.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const secret = randomBytes(24).toString("base64url");
  const link = await prisma.deviceLink.create({
    data: {
      secretHash: hashSecret(secret).toString("base64url"),
      platform: device.platform,
      deviceName: device.name ?? null,
      deviceId: device.id ?? null,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    },
  });
  return { id: link.id, secret, expiresAt: link.expiresAt.toISOString() };
}

async function openLink(id: string, secret: string) {
  const link = await prisma.deviceLink.findUnique({ where: { id } });
  const matches = link && timingSafeEqual(Buffer.from(link.secretHash, "base64url"), hashSecret(secret));
  if (!link || !matches || link.expiresAt < new Date()) {
    throw new AppError("LINK_NOT_FOUND", "That code has expired. Show a new one on the computer.");
  }
  return link;
}

/** What the phone shows before approving: the computer's browser and system, as it described itself. */
export async function previewLink(id: string, secret: string) {
  const link = await openLink(id, secret);
  return { platform: Platform.parse(link.platform), deviceName: link.deviceName };
}

/** Signs the computer in as `userId`, once; it picks up its session on its next check. */
export async function approveLink(userId: string, id: string, input: ApproveLinkInput) {
  await openLink(id, input.secret);
  const approved = await prisma.deviceLink.updateMany({
    where: { id, userId: null },
    data: { userId, sealedKey: input.sealedKey },
  });
  if (!approved.count) throw new AppError("LINK_NOT_FOUND", "That code was already used");
}

/**
 * The computer's check: null until a phone approves, then a new session for that account, with the sealed
 * backup key. The ticket is used up either way, so a copied secret can't sign in a second browser.
 */
export async function claimLink(id: string, secret: string): Promise<(IssuedAuth & { sealedKey: string | null }) | null> {
  const link = await openLink(id, secret);
  if (!link.userId) return null;
  const { user, session, refresh } = await prisma.$transaction(async (tx) => {
    const used = await tx.deviceLink.deleteMany({ where: { id, userId: link.userId } });
    if (!used.count) throw new AppError("LINK_NOT_FOUND", "That code was already used");
    const user = await tx.user.findUniqueOrThrow({ where: { id: link.userId! } });
    checkBan(user);
    await checkDeviceBan(tx, link.deviceId, user.email);
    const device = { platform: Platform.parse(link.platform), name: link.deviceName ?? undefined, id: link.deviceId ?? undefined };
    return { user, ...(await createSession(tx, user.id, device)) };
  });
  return {
    ...(await issueAccess(user.id, session.id)),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: session.expiresAt,
    user: toUserDTO(user),
    sealedKey: link.sealedKey,
  };
}

export async function logout(sessionId: string) {
  await revokeSession(sessionId);
}
