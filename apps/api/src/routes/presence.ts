import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { PresenceList, PresenceQuery } from "@six/shared";
import { presenceOf } from "../lib/presence.js";
import { prisma } from "../lib/prisma.js";
import { blockedWith } from "../services/blocks.js";

const presenceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/presence",
    {
      onRequest: app.requireAuth,
      schema: {
        tags: ["presence"],
        summary: "Whether people are online, and when they were last seen",
        description:
          "Only people you share a chat with are returned; other ids are left out. Live changes arrive as the `presence` socket event.",
        security: [{ bearer: [] }],
        querystring: PresenceQuery,
        response: { 200: PresenceList },
      },
    },
    async (req) => {
      const known = await prisma.chatMember.findMany({
        where: { userId: { in: req.query.ids }, chat: { members: { some: { userId: req.auth.userId } } } },
        select: { userId: true },
        distinct: ["userId"],
      });
      const blocked = await blockedWith(prisma, req.auth.userId);
      return { items: await presenceOf(known.map((m) => m.userId).filter((id) => !blocked.has(id))) };
    },
  );
};

export default presenceRoutes;
