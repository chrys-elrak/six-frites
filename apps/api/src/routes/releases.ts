import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { LatestAppDTO } from "@six/shared";
import { announceRelease, latestRelease, storeDownloadUrl } from "../services/releases.js";

/** The Android app, published on Koera Store and open to everyone so the link works before signing in. */
const appRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/app/android",
    {
      schema: {
        tags: ["app"],
        summary: "The newest Android app, or null when none is published",
        response: { 200: LatestAppDTO.nullable() },
      },
    },
    () => latestRelease(),
  );

  app.get(
    "/app/android/download",
    { schema: { tags: ["app"], summary: "Redirects to the newest Android APK" } },
    (_req, reply) => reply.redirect(storeDownloadUrl, 302),
  );

  await app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    hook.post("/app/android/published", { schema: { hide: true } }, async (req, reply) => {
      announceRelease(req.body as string, req.headers["x-koera-signature"] as string | undefined);
      return reply.status(204).send();
    });
  });
};

export default appRoutes;
