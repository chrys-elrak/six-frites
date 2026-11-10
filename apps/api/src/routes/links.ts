import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { LinkPreviewDTO, LinkPreviewQuery, PlaceNameDTO, PlaceNameQuery, ResolvedLinkDTO } from "@six/shared";
import { followShareLink, linkPreview } from "../services/link-previews.js";
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
    "/link-resolve",
    {
      config: { guest: true, rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["chats"],
        summary: "A shared link without who shared it",
        description:
          "Drops the parameters that tell a site who shared a link, and follows share links whose code itself names the sender (TikTok, Instagram and Facebook short links) to the page they lead to. The server follows them, so the site sees neither the sender nor the reader. Null when a share link can't be followed.",
        security: [{ bearer: [] }],
        querystring: LinkPreviewQuery,
        response: { 200: ResolvedLinkDTO },
      },
    },
    async (req) => ({ url: await followShareLink(req.query.url) }),
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
