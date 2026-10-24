import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ChatDTO,
  ChatListQuery,
  ChatReadDTO,
  Id,
  MarkReadInput,
  MessageDTO,
  PageQuery,
  SendMessageInput,
  SyncQuery,
  SyncResult,
  page,
} from "@six/shared";
import { getChat, listChats, markRead } from "../services/chats.js";
import { listMessages, sendMessage } from "../services/messages.js";
import { sync } from "../services/sync.js";

const ChatParams = z.object({ id: Id });
const security = [{ bearer: [] }];

const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/chats",
    {
      schema: {
        tags: ["chats"],
        summary: "List chats, most recent activity first",
        security,
        querystring: ChatListQuery,
        response: { 200: page(ChatDTO) },
      },
    },
    (req) => listChats(req.auth.userId, req.query),
  );

  app.get(
    "/chats/:id",
    {
      schema: { tags: ["chats"], summary: "Get one chat", security, params: ChatParams, response: { 200: ChatDTO } },
    },
    (req) => getChat(req.auth.userId, req.params.id),
  );

  app.get(
    "/chats/:id/messages",
    {
      schema: {
        tags: ["messages"],
        summary: "Messages in a chat, newest first",
        security,
        params: ChatParams,
        querystring: PageQuery,
        response: { 200: page(MessageDTO) },
      },
    },
    (req) => listMessages(req.auth.userId, req.params.id, req.query),
  );

  app.post(
    "/chats/:id/messages",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["messages"],
        summary: "Send a message",
        description: "Idempotent per `clientId`: retrying with the same clientId returns the original message.",
        security,
        params: ChatParams,
        body: SendMessageInput,
        response: { 201: MessageDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await sendMessage(req.auth.userId, req.params.id, req.body)),
  );

  app.post(
    "/chats/:id/read",
    {
      schema: {
        tags: ["chats"],
        summary: "Mark messages as read up to `messageId` (or the latest)",
        description: "Returns null when the read marker did not move forward.",
        security,
        params: ChatParams,
        body: MarkReadInput.nullish(),
        response: { 200: ChatReadDTO.nullable() },
      },
    },
    (req) => markRead(req.auth.userId, req.params.id, req.body ?? {}),
  );

  app.get(
    "/sync",
    {
      schema: {
        tags: ["sync"],
        summary: "Changes since an event cursor",
        description:
          "Call without `since` to get the current cursor. On reconnect, page through with the returned cursor until `hasMore` is false, then resume the socket.",
        security,
        querystring: SyncQuery,
        response: { 200: SyncResult },
      },
    },
    (req) => sync(req.auth.userId, req.query),
  );
};

export default chatRoutes;
