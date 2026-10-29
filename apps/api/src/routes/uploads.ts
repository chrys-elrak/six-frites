import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AttachmentDTO, Id, PresignUploadInput, PresignUploadResult } from "@six/shared";
import { completeUpload, getUpload, presignUpload } from "../services/uploads.js";

const security = [{ bearer: [] }];
const Params = z.object({ id: Id });

const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.post(
    "/uploads/presign",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["uploads"],
        summary: "Start an upload (max 1 GB; encrypted files max 100 MB)",
        description:
          "Returns a URL to PUT the file to directly, with the given headers. Then call POST /v1/uploads/{id}/complete.",
        security,
        body: PresignUploadInput,
        response: { 201: PresignUploadResult },
      },
    },
    async (req, reply) => reply.status(201).send(await presignUpload(req.auth.userId, req.body)),
  );

  app.post(
    "/uploads/:id/complete",
    {
      schema: {
        tags: ["uploads"],
        summary: "Confirm the file was uploaded and start processing it",
        description:
          "Images, video and voice notes are converted in the background (status `processing`); other files are `ready` at once. A message can be sent with the upload right away.",
        security,
        params: Params,
        response: { 200: AttachmentDTO },
      },
    },
    (req) => completeUpload(req.auth.userId, req.params.id),
  );

  app.get(
    "/uploads/:id",
    {
      schema: {
        tags: ["uploads"],
        summary: "One of your uploads, with fresh download links",
        security,
        params: Params,
        response: { 200: AttachmentDTO },
      },
    },
    (req) => getUpload(req.auth.userId, req.params.id),
  );
};

export default uploadRoutes;
