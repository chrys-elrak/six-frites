import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError, AuthResult, GoogleLoginInput, RefreshInput } from "@six/shared";
import { isProd } from "../env.js";
import { type IssuedAuth, loginWithGoogle, logout, refreshSession } from "../services/auth.js";

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
