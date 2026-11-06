import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { NotificationsDTO } from "@six/shared";
import { listNotifications, markNotificationsSeen } from "../services/notifications.js";

const security = [{ bearer: [] }];

const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/notifications",
    {
      schema: {
        tags: ["notifications"],
        summary: "My latest notifications, newest first",
        description: "Listen for `notifications:changed` on the socket to know when to fetch them again.",
        security,
        response: { 200: NotificationsDTO },
      },
    },
    (req) => listNotifications(req.auth.userId),
  );

  app.post(
    "/notifications/seen",
    { schema: { tags: ["notifications"], summary: "Mark every notification as seen", security, response: { 204: z.null() } } },
    async (req, reply) => {
      await markNotificationsSeen(req.auth.userId);
      return reply.status(204).send(null);
    },
  );
};

export default notificationRoutes;
