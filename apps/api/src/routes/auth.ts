import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError, AuthResult, ClaimLinkInput, FirebaseLoginInput, GoogleLoginInput, LinkClaim, LinkTicket, RefreshInput, StartLinkInput } from "@six/shared";
import { isProd } from "../env.js";
import { type IssuedAuth, claimLink, loginWithFirebase, loginWithGoogle, logout, refreshSession, startLink } from "../services/auth.js";

const REFRESH_COOKIE = "six_rt";
const cookiePath = "/v1/auth";

function respond(req: FastifyRequest, reply: FastifyReply, issued: IssuedAuth, web: boolean): AuthResult {
  const { refreshToken, refreshTokenExpiresAt, ...rest } = issued;
  if (!web) return { ...rest, refreshToken };
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: cookiePath,
    expires: refreshTokenExpiresAt,
  });
  return rest;
}

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/google",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Sign in with a Google ID token",
        description: "Web clients receive the refresh token as an httpOnly cookie; native clients receive it in the body.",
        body: GoogleLoginInput,
        response: { 200: AuthResult },
      },
    },
    async (req, reply) => {
      const issued = await loginWithGoogle(req.body);
      return respond(req, reply, issued, req.body.device.platform === "web");
    },
  );

  app.post(
    "/firebase",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Sign in with a Firebase ID token: Google, Apple or Facebook",
        description:
          "Like /google. Someone who joined with Google keeps their account. EMAIL_TAKEN when the email has an account and the provider didn't verify it; EMAIL_REQUIRED when it has no email, or when the provider didn't verify it and it has no account yet.",
        body: FirebaseLoginInput,
        response: { 200: AuthResult },
      },
    },
    async (req, reply) => {
      const issued = await loginWithFirebase(req.body);
      return respond(req, reply, issued, req.body.device.platform === "web");
    },
  );

  app.post(
    "/link",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Start signing in this computer by scanning a QR code with a signed-in phone",
        description:
          "Show `id` and `secret` in a QR code, with a one-time X25519 public key the phone seals the backup key to. Expires after two minutes.",
        body: StartLinkInput,
        response: { 200: LinkTicket },
      },
    },
    (req) => startLink(req.body.device),
  );

  app.post(
    "/link/claim",
    {
      config: { rateLimit: { max: 90, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Check whether a phone has approved this computer",
        description:
          "`waiting` until then; once approved it signs in like /google, once only. LINK_NOT_FOUND when the code expired or was used.",
        body: ClaimLinkInput,
        response: { 200: LinkClaim },
      },
    },
    async (req, reply) => {
      const claimed = await claimLink(req.body.id, req.body.secret);
      if (!claimed) return { status: "waiting" as const };
      const { sealedKey, ...issued } = claimed;
      return { status: "linked" as const, sealedKey, ...respond(req, reply, issued, true) };
    },
  );

  app.post(
    "/refresh",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        summary: "Rotate the refresh token and get a new access token",
        description: "Send `refreshToken` in the body (native) or rely on the httpOnly cookie (web).",
        body: RefreshInput.nullish(),
        response: { 200: AuthResult },
      },
    },
    async (req, reply) => {
      const fromBody = req.body?.refreshToken;
      const token = fromBody ?? req.cookies[REFRESH_COOKIE];
      if (!token) throw new AppError("INVALID_REFRESH_TOKEN", "No refresh token provided");
      try {
        const issued = await refreshSession(token);
        return respond(req, reply, issued, !fromBody);
      } catch (err) {
        if (!fromBody) reply.clearCookie(REFRESH_COOKIE, { path: cookiePath });
        throw err;
      }
    },
  );

  app.post(
    "/logout",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags: ["auth"],
        summary: "Revoke the current session",
        security: [{ bearer: [] }],
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await logout(req.auth.sessionId);
      reply.clearCookie(REFRESH_COOKIE, { path: cookiePath });
      return reply.status(204).send(null);
    },
  );
};

export default authRoutes;
