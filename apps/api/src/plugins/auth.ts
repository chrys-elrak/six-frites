import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "@six/shared";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { type AccessClaims, verifyAccessToken } from "../lib/tokens.js";
import { assertSessionActive } from "../services/sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AccessClaims;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
    requireAdmin: (req: FastifyRequest) => Promise<void>;
  }
}

export const isAdminEmail = (email: string) => env.ADMIN_EMAILS.includes(email.toLowerCase());

export async function authenticateBearer(header: string | undefined) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) throw new AppError("UNAUTHENTICATED", "Missing bearer token");
  const claims = await verifyAccessToken(token);
  await assertSessionActive(claims.sessionId);
  return claims;
}

export default fp(async (app) => {
  app.decorateRequest("auth", null as unknown as AccessClaims);
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    req.auth = await authenticateBearer(req.headers.authorization);
  });
  app.decorate("requireAdmin", async (req: FastifyRequest) => {
    req.auth = await authenticateBearer(req.headers.authorization);
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { email: true } });
    if (!user || !isAdminEmail(user.email)) throw new AppError("FORBIDDEN", "Admins only");
  });
});
