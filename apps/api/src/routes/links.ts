import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { LinkPreviewDTO, LinkPreviewQuery, PlaceNameDTO, PlaceNameQuery } from "@six/shared";
import { linkPreview } from "../services/link-previews.js";
import { placeName } from "../services/places.js";

const linkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/link-preview",
    {
      config: { guest: true, rateLimit: { max: 120, timeWindow: "1 minute" } },
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

  app.get(
    "/place-name",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["stories"],
        summary: "What a spot is called, to name the place on a story",
        description:
          "Asks OpenStreetMap on your behalf, so it never sees who you are. The neighbourhood and town in `locale`, or null when it knows nothing there or can't be reached.",
        security: [{ bearer: [] }],
        querystring: PlaceNameQuery,
        response: { 200: PlaceNameDTO },
      },
    },
    (req) => placeName(req.query.lat, req.query.lng, req.query.locale),
  );
};

export default linkRoutes;
