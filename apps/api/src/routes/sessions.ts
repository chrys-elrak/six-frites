import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Id, SessionDTO } from "@six/shared";
import { listSessions, revokeOtherSessions, revokeUserSession } from "../services/sessions.js";

const sessionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/sessions",
    {
      schema: {
        tags: ["sessions"],
        summary: "List active sessions (devices)",
        security: [{ bearer: [] }],
        response: { 200: z.object({ items: z.array(SessionDTO) }) },
      },
    },
    async (req) => ({ items: await listSessions(req.auth.userId, req.auth.sessionId) }),
  );

  app.delete(
    "/sessions/:id",
    {
      schema: {
        tags: ["sessions"],
        summary: "Log out one device",
        security: [{ bearer: [] }],
        params: z.object({ id: Id }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await revokeUserSession(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/sessions",
    {
      schema: {
        tags: ["sessions"],
        summary: "Log out every other device",
        security: [{ bearer: [] }],
        response: { 200: z.object({ revoked: z.number().int() }) },
      },
    },
    async (req) => ({ revoked: await revokeOtherSessions(req.auth.userId, req.auth.sessionId) }),
  );
};

export default sessionRoutes;
