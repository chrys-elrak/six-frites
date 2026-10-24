import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { AppError } from "@six/shared";
import { env } from "../env.js";

export const ACCESS_TTL_SECS = 15 * 60;
export const REFRESH_TTL_SECS = 30 * 24 * 60 * 60;

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export async function signAccessToken(claims: AccessClaims) {
  const expiresAt = new Date(Date.now() + ACCESS_TTL_SECS * 1000);
  const token = await new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.sid !== "string") throw new Error("bad claims");
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw new AppError("UNAUTHENTICATED", "Invalid or expired access token");
  }
}

/**
 * Refresh tokens are `<sessionId>.<secret>`. Embedding the session id lets us find the
 * session even when an old (already rotated) secret is replayed, which is how reuse is detected.
 */
export function newRefreshToken(sessionId: string) {
  const token = `${sessionId}.${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export function parseRefreshToken(token: string) {
  const dot = token.indexOf(".");
  if (dot <= 0) throw new AppError("INVALID_REFRESH_TOKEN");
  return { sessionId: token.slice(0, dot), hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
