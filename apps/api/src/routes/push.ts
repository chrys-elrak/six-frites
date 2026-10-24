import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PushConfigDTO, RegisterPushTokenInput, RemovePushTokenQuery } from "@six/shared";
import { pushConfig, registerPushToken, removePushToken } from "../services/push.js";

const security = [{ bearer: [] }];

const pushRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/push/config",
    {
      schema: {
        tags: ["push"],
        summary: "Public settings for subscribing to push notifications",
        response: { 200: PushConfigDTO },
      },
    },
    () => pushConfig(),
  );

  app.register(async (scope) => {
    const authed = scope.withTypeProvider<ZodTypeProvider>();
    authed.addHook("onRequest", app.requireAuth);

    authed.post(
      "/devices/push-token",
      {
        schema: {
          tags: ["push"],
          summary: "Register this device for push notifications",
          description:
            "One token per provider per session (signing out removes it). Notifications are skipped while the app is open and visible on that device.",
          security,
          body: RegisterPushTokenInput,
          response: { 204: z.null() },
        },
      },
      async (req, reply) => {
        await registerPushToken(req.auth.sessionId, req.body);
        return reply.status(204).send(null);
      },
    );

    authed.delete(
      "/devices/push-token",
      {
        schema: {
          tags: ["push"],
          summary: "Stop push notifications on this device",
          security,
          querystring: RemovePushTokenQuery,
          response: { 204: z.null() },
        },
      },
      async (req, reply) => {
        await removePushToken(req.auth.sessionId, req.query.provider);
        return reply.status(204).send(null);
      },
    );
  });
};

export default pushRoutes;
