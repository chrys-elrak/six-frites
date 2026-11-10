import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  LinkPreviewDTO,
  LinkPreviewQuery,
  PlaceNameDTO,
  PlaceNameQuery,
  MapAllowanceDTO,
  MapPickerQuery,
  MapPreviewQuery,
  PlaceDetailsDTO,
  PlaceDetailsQuery,
  PlaceSuggestDTO,
  PlaceSuggestQuery,
  ResolvedLinkDTO,
} from "@six/shared";
import { followShareLink, linkPreview } from "../services/link-previews.js";
import { mapPreview, openMapPicker, placeDetails, placeName, suggestPlaces } from "../services/places.js";

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

  app.get(
    "/place-suggest",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["chats"],
        summary: "Places matching what you have typed so far, to share one in a chat",
        description:
          "Asks Google Maps, or OpenStreetMap, on your behalf, so neither sees who you are. Each new `session` is one of the few searches you have a month (`left`); typing more in the same session is free. PLACE_SEARCH_LIMIT_REACHED once they are used up, PLACES_UNAVAILABLE when the provider can't be reached.",
        security: [{ bearer: [] }],
        querystring: PlaceSuggestQuery,
        response: { 200: PlaceSuggestDTO },
      },
    },
    (req) => suggestPlaces(req.auth.userId, req.query),
  );

  app.get(
    "/place-details",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["chats"],
        summary: "Where a suggested place is",
        description: "With the `session` its suggestion came in, which this ends: start a new one for the next search. NOT_FOUND for an unknown place.",
        security: [{ bearer: [] }],
        querystring: PlaceDetailsQuery,
        response: { 200: PlaceDetailsDTO },
      },
    },
    (req) => placeDetails(req.auth.userId, req.query),
  );

  app.get(
    "/map-preview",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["chats"],
        summary: "A small Google map of a place, for a message",
        description:
          "A 512×256 picture with a pin. Each different place counts once against your monthly share (MAP_LIMIT_REACHED past it); PLACES_UNAVAILABLE when Google can't be reached or isn't set up. Draw the place yourself then.",
        security: [{ bearer: [] }],
        querystring: MapPreviewQuery,
      },
    },
    async (req, reply) => {
      const { type, body } = await mapPreview(req.auth.userId, req.query);
      return reply.header("cache-control", "private, max-age=86400").type(type).send(body);
    },
  );

  app.get(
    "/map-picker",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["chats"],
        summary: "Ask to open the place picker on Google's interactive map",
        description:
          "Each `session` (one opening of the picker) counts once against your monthly share. MAP_LIMIT_REACHED past it: use OpenStreetMap instead.",
        security: [{ bearer: [] }],
        querystring: MapPickerQuery,
        response: { 200: MapAllowanceDTO },
      },
    },
    (req) => openMapPicker(req.auth.userId, req.query.session),
  );
};

export default linkRoutes;
