import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "@six/shared";

const Key = z.string().regex(/^[0-9a-f]{2,6}(_[0-9a-f]{2,6}){0,9}$/);
// ponytail: in-memory, bounded by the ~900 animated emoji Google has; move to object storage if memory gets tight
const cache = new Map<string, Promise<string | null>>();

const fetchLottie = (key: string) =>
  fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${key}/lottie.json`).then((res) => (res.ok ? res.text() : null));

// ponytail: in-memory, a few KB for each of the ~3,800 emoji at most; move to object storage if memory gets tight
const pictures = new Map<string, Promise<string | null>>();

const fetchSvg = (key: string) =>
  fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${key}/emoji.svg`).then((res) => (res.ok ? res.text() : null));

/** Noto's picture of an emoji, trying it without its variation selectors when Google files it that way. */
const fetchPicture = async (key: string) => (await fetchSvg(key)) ?? (key.includes("_fe0f") ? fetchSvg(key.replace(/_fe0f/g, "")) : null);

/** Serves Noto's emoji pictures and animations from here, so devices never tell Google which emoji they're showing. */
const emojiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/emoji/:key/lottie.json",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
      schema: {
        tags: ["stickers"],
        summary: "An animated emoji as Lottie JSON, by its code points (like 1f600 or 2764_fe0f)",
        params: z.object({ key: Key }),
      },
    },
    async (req, reply) => {
      const { key } = req.params;
      let json = cache.get(key);
      if (!json) {
        json = fetchLottie(key).catch(() => null);
        cache.set(key, json);
      }
      const body = await json;
      if (body === null) {
        cache.delete(key);
        throw new AppError("NOT_FOUND", "No animation for this emoji");
      }
      return reply.type("application/json").header("cache-control", "public, max-age=31536000, immutable").send(body);
    },
  );

  app.get(
    "/emoji/:key/emoji.svg",
    {
      config: { rateLimit: { max: 3000, timeWindow: "1 minute" } },
      schema: {
        tags: ["stickers"],
        summary: "An emoji drawn by Noto as SVG, by its code points (like 1f600 or 2764_fe0f)",
        description: "For browsers that can't draw the Noto Color Emoji font, like Safari.",
        params: z.object({ key: Key }),
      },
    },
    async (req, reply) => {
      const { key } = req.params;
      let svg = pictures.get(key);
      if (!svg) {
        svg = fetchPicture(key).catch(() => null);
        pictures.set(key, svg);
      }
      const body = await svg;
      if (body === null) {
        pictures.delete(key);
        throw new AppError("NOT_FOUND", "No picture for this emoji");
      }
      return reply.type("image/svg+xml").header("cache-control", "public, max-age=31536000, immutable").send(body);
    },
  );
};

export default emojiRoutes;
