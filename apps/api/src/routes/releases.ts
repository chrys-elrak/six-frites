import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppReleaseDTO, CreateReleaseInput, CreatedReleaseDTO, Id, LatestAppDTO } from "@six/shared";
import {
  createRelease,
  deleteRelease,
  latestDownloadUrl,
  latestRelease,
  listReleases,
  publishRelease,
} from "../services/releases.js";

const Params = z.object({ id: Id });
const security = [{ bearer: [] }];

/** The Android app download, open to everyone so the link works before signing in. */
export const appRoutes: FastifyPluginAsyncZod = async (app) => {
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
    async (_req, reply) => reply.redirect(await latestDownloadUrl(), 302),
  );
};

const releaseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAdmin);
  const tags = ["admin"];

  app.get(
    "/admin/releases",
    {
      schema: { tags, summary: "Android app releases, newest first", security, response: { 200: z.array(AppReleaseDTO) } },
    },
    () => listReleases(),
  );

  app.post(
    "/admin/releases",
    {
      schema: {
        tags,
        summary: "Start a new Android release",
        description: "Returns a link to PUT the APK to. Publish it once the upload finishes.",
        security,
        body: CreateReleaseInput,
        response: { 201: CreatedReleaseDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await createRelease(req.auth.userId, req.body)),
  );

  app.post(
    "/admin/releases/:id/publish",
    {
      schema: {
        tags,
        summary: "Offer an uploaded release for download",
        security,
        params: Params,
        response: { 200: AppReleaseDTO },
      },
    },
    (req) => publishRelease(req.params.id),
  );

  app.delete(
    "/admin/releases/:id",
    { schema: { tags, summary: "Delete a release and its APK", security, params: Params, response: { 204: z.null() } } },
    async (req, reply) => {
      await deleteRelease(req.params.id);
      return reply.status(204).send(null);
    },
  );
};

export default releaseRoutes;
