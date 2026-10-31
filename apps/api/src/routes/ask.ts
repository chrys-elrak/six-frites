import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  AnonMessageDTO,
  AskProfileDTO,
  PageQuery,
  SendAnonInput,
  SentAnonDTO,
  UpdateAskProfileInput,
  UserDTO,
  page,
} from "@six/shared";
import { z } from "zod";
import {
  askProfile,
  blockAnonSender,
  deleteAnon,
  deleteSent,
  listAnon,
  listSent,
  resetAskCode,
  sendAnon,
  updateAskProfile,
} from "../services/ask.js";

const tags = ["ask"];
const security = [{ bearer: [] }];
const code = z.object({ code: z.string().min(1).max(32) });
const id = z.object({ id: z.string().min(1) });

const askRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/ask/:code",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Whose anonymous messages link this is",
        description: "Open to anyone, so the page can show who you're writing to before you sign in.",
        params: code,
        response: { 200: AskProfileDTO },
      },
    },
    (req) => askProfile(req.params.code),
  );

  app.post(
    "/ask/:code",
    {
      onRequest: app.requireAuth,
      bodyLimit: 800 * 1024,
      config: { guest: true, rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Send someone an anonymous message",
        description: "They never see who sent it; moderators can, if they report it.",
        security,
        params: code,
        body: SendAnonInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await sendAnon(req.auth.userId, req.params.code, req.body);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/ask",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "The anonymous messages you got, newest first",
        security,
        querystring: PageQuery,
        response: { 200: page(AnonMessageDTO) },
      },
    },
    (req) => listAnon(req.auth.userId, req.query),
  );

  app.get(
    "/ask/sent",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "The anonymous messages you sent, newest first",
        description: "Only you see this list. It never says whether the recipient deleted a message or blocked you.",
        security,
        querystring: PageQuery,
        response: { 200: page(SentAnonDTO) },
      },
    },
    (req) => listSent(req.auth.userId, req.query),
  );

  app.delete(
    "/ask/sent/:id",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "Remove a message from your sent list",
        description: "The recipient keeps it, and the moderators still see it.",
        security,
        params: id,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteSent(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    "/ask/profile",
    {
      onRequest: app.requireAuth,
      config: { guest: true, rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Change the name and photo shown on your link",
        description: "Your account keeps its own name and photo.",
        security,
        body: UpdateAskProfileInput,
        response: { 200: AskProfileDTO },
      },
    },
    (req) => updateAskProfile(req.auth.userId, req.body),
  );

  app.post(
    "/ask/code",
    {
      onRequest: app.requireAuth,
      config: { guest: true, rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Get a new link for anonymous messages",
        description: "The old link stops working. Messages you already got stay.",
        security,
        response: { 200: UserDTO },
      },
    },
    (req) => resetAskCode(req.auth.userId),
  );

  app.delete(
    "/ask/messages/:id",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "Delete an anonymous message you got",
        description: "It leaves your inbox; the moderators still see it.",
        security,
        params: id,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteAnon(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/ask/messages/:id/block",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "Stop whoever sent this anonymous message from sending you more",
        description: "Deletes the message too. You still never learn who it was.",
        security,
        params: id,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await blockAnonSender(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );
};

export default askRoutes;
