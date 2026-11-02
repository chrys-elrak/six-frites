import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  AnonBotInput,
  AnonMessageDTO,
  AskLinkDTO,
  AskProfileDTO,
  CreateTempLinkInput,
  PageQuery,
  SendAnonInput,
  SentAnonDTO,
  TEMP_LINK_MAX,
  TempLinkDTO,
  UpdateAskProfileInput,
  UserDTO,
  page,
} from "@six/shared";
import { z } from "zod";
import { authenticateBearer } from "../plugins/auth.js";
import {
  askLink,
  blockAnonSender,
  createTempLink,
  deleteAnon,
  deleteSent,
  deleteTempLink,
  listAnon,
  listSent,
  listTempLinks,
  resetAskCode,
  sendAnon,
  setAnonBot,
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
        description:
          "Open to anyone, so the page can show who you're writing to before you sign in. Signed in, it also says whether this person blocked you.",
        params: code,
        response: { 200: AskLinkDTO },
      },
    },
    async (req) => {
      const viewer = req.headers.authorization ? await authenticateBearer(req.headers.authorization).catch(() => null) : null;
      return askLink(req.params.code, viewer?.userId);
    },
  );

  app.post(
    "/ask/:code",
    {
      onRequest: app.requireAuth,
      bodyLimit: 1536 * 1024,
      config: { guest: true, rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Send someone an anonymous message",
        description:
          "They never see who sent it; moderators can see the sender of every anonymous message. Someone the recipient blocked gets ANON_BLOCKED.",
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
        description: "Only you see this list. It never says whether the recipient deleted a message.",
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
        summary: "Change the name, photo and prompt shown on your link",
        description: "Your account keeps its own name and photo.",
        security,
        body: UpdateAskProfileInput,
        response: { 200: AskProfileDTO },
      },
    },
    (req) => updateAskProfile(req.auth.userId, req.body),
  );

  app.get(
    "/ask/links",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "Your temporary links that still work, newest first",
        security,
        response: { 200: z.array(TempLinkDTO) },
      },
    },
    (req) => listTempLinks(req.auth.userId),
  );

  app.post(
    "/ask/links",
    {
      onRequest: app.requireAuth,
      config: { guest: true, rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Make a temporary link to your anonymous messages",
        description: `It stops working after the hours you pick; your own link doesn't change. ${TEMP_LINK_MAX} at once at most.`,
        security,
        body: CreateTempLinkInput,
        response: { 200: TempLinkDTO },
      },
    },
    (req) => createTempLink(req.auth.userId, req.body),
  );

  app.delete(
    "/ask/links/:code",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "Stop a temporary link now",
        description: "Messages that came through it stay.",
        security,
        params: code,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteTempLink(req.auth.userId, req.params.code);
      return reply.status(204).send(null);
    },
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

  app.put(
    "/ask/bot",
    {
      onRequest: app.requireAuth,
      config: { guest: true },
      schema: {
        tags,
        summary: "Turn the Six Frites bot's questions on or off",
        description: "Now and then, at no set time, the bot sends a question to your anonymous inbox, never the same one twice.",
        security,
        body: AnonBotInput,
        response: { 200: UserDTO },
      },
    },
    (req) => setAnonBot(req.auth.userId, req.body.on),
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
        description:
          "Covers other accounts used on the sender's devices too, and deletes the message. They're told they can't write to you anymore; you still never learn who it was.",
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
