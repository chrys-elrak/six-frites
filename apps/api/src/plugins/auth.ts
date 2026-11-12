import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "@six/shared";
import { env, isProd } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { type AccessClaims, verifyAccessToken } from "../lib/tokens.js";
import { assertSessionActive, chatBanned } from "../services/sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AccessClaims;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
    requireAdmin: (req: FastifyRequest) => Promise<void>;
    requireAdminSignIn: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyContextConfig {
    /** Lets guests from the support page in too; every other route turns them away. */
    guest?: boolean;
  }
}

export const isAdminEmail = (email: string) => env.ADMIN_EMAILS.includes(email.toLowerCase());

export async function authenticateBearer(header: string | undefined) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) throw new AppError("UNAUTHENTICATED", "Missing bearer token");
  const claims = await verifyAccessToken(token);
  const session = await assertSessionActive(claims.sessionId);
  return { ...claims, guest: session.user.guest || chatBanned(session.user) };
}

/** How long an authenticator code keeps moderation open on a session. */
const ADMIN_2FA_MS = 12 * 60 * 60 * 1000;

/** Where an admin's session stands with their authenticator: none set up yet, a code due, or open. */
export async function adminTwoFactor(sessionId: string) {
  if (env.ADMIN_SKIP_2FA === "true" && !isProd) return "ok" as const;
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { adminVerifiedAt: true, user: { select: { totpSecret: true } } },
  });
  if (!session.user.totpSecret) return "setup" as const;
  const fresh = session.adminVerifiedAt && session.adminVerifiedAt.getTime() > Date.now() - ADMIN_2FA_MS;
  return fresh ? ("ok" as const) : ("required" as const);
}

async function authenticateAdmin(req: FastifyRequest) {
  const { guest, ...claims } = await authenticateBearer(req.headers.authorization);
  req.auth = claims;
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { email: true } });
  if (guest || !user || !isAdminEmail(user.email)) throw new AppError("FORBIDDEN", "Admins only");
}

export default fp(async (app) => {
  app.decorateRequest("auth", null as unknown as AccessClaims);
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const { guest, ...claims } = await authenticateBearer(req.headers.authorization);
    if (guest && !req.routeOptions.config.guest) throw new AppError("FORBIDDEN", "Guests can only write to support");
    req.auth = claims;
  });
  app.decorate("requireAdminSignIn", authenticateAdmin);
  app.decorate("requireAdmin", async (req: FastifyRequest) => {
    await authenticateAdmin(req);
    if ((await adminTwoFactor(req.auth.sessionId)) !== "ok") {
      throw new AppError("ADMIN_2FA_REQUIRED", "Enter a code from your authenticator app first");
    }
  });
});
