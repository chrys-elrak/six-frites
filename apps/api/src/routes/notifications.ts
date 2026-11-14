import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Id, NotificationsDTO, UpdateNotificationInput } from "@six/shared";
import {
  clearNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotification,
  markNotificationsSeen,
} from "../services/notifications.js";

const security = [{ bearer: [] }];
const Params = z.object({ id: Id });

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

  app.post(
    "/notifications/read",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark every notification as read",
        description: "Unlike `seen`, this also marks read the ones marked unread again.",
        security,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await markAllNotificationsRead(req.auth.userId);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/notifications",
    { schema: { tags: ["notifications"], summary: "Delete all my notifications", security, response: { 204: z.null() } } },
    async (req, reply) => {
      await clearNotifications(req.auth.userId);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    "/notifications/:id",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark a notification unread again, or read",
        description: "One marked unread stays unread until it is marked read, but doesn't count in `unread`.",
        security,
        params: Params,
        body: UpdateNotificationInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await markNotification(req.auth.userId, req.params.id, req.body.unread);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/notifications/:id",
    { schema: { tags: ["notifications"], summary: "Delete a notification", security, params: Params, response: { 204: z.null() } } },
    async (req, reply) => {
      await deleteNotification(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );
};

export default notificationRoutes;
