import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AddStickerInput,
  CreateStickerPackInput,
  GifDTO,
  GifQuery,
  Id,
  StickerDTO,
  StickerPackDTO,
  page,
} from "@six/shared";
import { listGifs } from "../services/gifs.js";
import { addSticker, createPack, getPack, listPacks, removeSticker, searchStickers, setPackSaved } from "../services/stickers.js";

const PackParams = z.object({ id: Id });
const security = [{ bearer: [] }];

const stickerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/stickers/search",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["stickers"],
        summary: "Stickers from your packs, by name or by the emoji they stand for",
        description: "Searches the built-in and official packs and the ones you made or saved; yours come first.",
        security,
        querystring: z.object({ q: z.string().max(64).default("") }),
        response: { 200: z.object({ items: z.array(StickerDTO) }) },
      },
    },
    (req) => searchStickers(req.auth.userId, req.query.q),
  );

  app.get(
    "/sticker-packs",
    {
      schema: {
        tags: ["stickers"],
        summary: "Your sticker packs: the built-in ones, then the ones you made or saved",
        security,
        response: { 200: page(StickerPackDTO) },
      },
    },
    (req) => listPacks(req.auth.userId),
  );

  app.post(
    "/sticker-packs",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      preHandler: app.requireAdminSignIn,
      schema: {
        tags: ["stickers"],
        summary: "Create a sticker pack (admins only)",
        security,
        body: CreateStickerPackInput,
        response: { 201: StickerPackDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await createPack(req.auth.userId, req.body)),
  );

  app.get(
    "/sticker-packs/:id",
    {
      schema: {
        tags: ["stickers"],
        summary: "One sticker pack, e.g. the one a sticker you received comes from",
        security,
        params: PackParams,
        response: { 200: StickerPackDTO },
      },
    },
    (req) => getPack(req.auth.userId, req.params.id),
  );

  app.post(
    "/sticker-packs/:id/stickers",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
      preHandler: app.requireAdminSignIn,
      schema: {
        tags: ["stickers"],
        summary: "Add a sticker to a pack (admins only, to any pack)",
        description:
          "Upload the file first with kind `sticker` (.tgs, Lottie .json, .webp or .png, still or animated, at most 6 MB). Its `url` stays null until processing finishes.",
        security,
        params: PackParams,
        body: AddStickerInput,
        response: { 201: StickerDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await addSticker(req.auth.userId, req.params.id, req.body)),
  );

  app.delete(
    "/sticker-packs/:id/stickers/:stickerId",
    {
      schema: {
        tags: ["stickers"],
        summary: "Remove a sticker from your pack",
        description: "Messages that already show it keep it.",
        security,
        params: PackParams.extend({ stickerId: Id }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await removeSticker(req.auth.userId, req.params.id, req.params.stickerId);
      return reply.status(204).send(null);
    },
  );

  app.put(
    "/sticker-packs/:id/saved",
    {
      schema: {
        tags: ["stickers"],
        summary: "Add a pack to your stickers",
        security,
        params: PackParams,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await setPackSaved(req.auth.userId, req.params.id, true);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/sticker-packs/:id/saved",
    {
      schema: {
        tags: ["stickers"],
        summary: "Remove a pack from your stickers",
        security,
        params: PackParams,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await setPackSaved(req.auth.userId, req.params.id, false);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/gifs",
    {
      config: { guest: true, rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["gifs"],
        summary: "Search GIFs or stickers, or list trending ones",
        description:
          "Proxied from GIPHY and KLIPY, mixed together. Returns GIFS_UNAVAILABLE when the server has a key for neither. Send a GIF with `gifId`.",
        security,
        querystring: GifQuery,
        response: { 200: page(GifDTO) },
      },
    },
    (req) => listGifs(req.query),
  );
};

export default stickerRoutes;
