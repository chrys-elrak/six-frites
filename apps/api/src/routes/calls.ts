import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { IceServersDTO, Id, LogCallInput, MessageDTO } from "@six/shared";
import { z } from "zod";
import { iceServers, logCall } from "../services/calls.js";

const security = [{ bearer: [] }];

const callRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/calls/ice-servers",
    {
      schema: {
        tags: ["calls"],
        summary: "STUN and TURN servers for a call",
        description:
          "Signalling goes over the socket as `call:signal`, sealed per device like messages; the server only relays it.",
        security,
        response: { 200: IceServersDTO },
      },
    },
    (req) => iceServers(req.auth.userId),
  );

  app.post(
    "/chats/:id/calls",
    {
      schema: {
        tags: ["calls"],
        summary: "Log a call in the chat",
        description: "The caller posts this when a call ends, answered or not. Idempotent per callId.",
        security,
        params: z.object({ id: Id }),
        body: LogCallInput,
        response: { 201: MessageDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await logCall(req.auth.userId, req.params.id, req.body)),
  );
};

export default callRoutes;
