import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { LinkPreviewDTO, LinkPreviewQuery } from "@six/shared";
import { linkPreview } from "../services/link-previews.js";

const linkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/link-preview",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["chats"],
        summary: "The preview card for a link in a message",
        description:
          "The server fetches the page and its picture, so the site never learns who reads the link. Null when the page has no title or can't be reached.",
        security: [{ bearer: [] }],
        querystring: LinkPreviewQuery,
        response: { 200: LinkPreviewDTO.nullable() },
      },
    },
    (req) => linkPreview(req.query.url),
  );
};

export default linkRoutes;
