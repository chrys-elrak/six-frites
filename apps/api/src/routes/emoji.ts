import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "@six/shared";

const Key = z.string().regex(/^[0-9a-f]{2,6}(_[0-9a-f]{2,6}){0,9}$/);
// ponytail: in-memory, bounded by the ~900 animated emoji Google has; move to object storage if memory gets tight
const cache = new Map<string, Promise<string | null>>();

const fetchLottie = (key: string) =>
  fetch(`https://fonts.gstatic.com/s/e/notoemoji/latest/${key}/lottie.json`).then((res) => (res.ok ? res.text() : null));

/** Serves Noto's emoji animations from here, so devices never tell Google which emoji they're showing. */
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
};

export default emojiRoutes;
