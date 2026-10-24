import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ChatDTO,
  ChatDeliveredDTO,
  ChatListQuery,
  ChatReadDTO,
  ContactDTO,
  ContactListQuery,
  DeleteChatQuery,
  DeleteMessagesQuery,
  EditMessageInput,
  Id,
  MarkDeliveredInput,
  MarkReadInput,
  MessageDTO,
  PageQuery,
  SendMessageInput,
  SyncQuery,
  SyncResult,
  UpdateChatInput,
  page,
} from "@six/shared";
import { deleteChat, getChat, listChats, markDelivered, markRead, updateChat } from "../services/chats.js";
import { listContacts } from "../services/contacts.js";
import { deleteMessages, editMessage, listMessages, sendMessage } from "../services/messages.js";
import { sync } from "../services/sync.js";

const ChatParams = z.object({ id: Id });
const MessageParams = z.object({ id: Id });
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

  app.patch(
    "/chats/:id",
    {
      schema: {
        tags: ["chats"],
        summary: "Archive, mute or pin a chat (your settings only)",
        security,
        params: ChatParams,
        body: UpdateChatInput,
        response: { 200: ChatDTO },
      },
    },
    (req) => updateChat(req.auth.userId, req.params.id, req.body),
  );

  app.delete(
    "/chats/:id",
    {
      schema: {
        tags: ["chats"],
        summary: "Delete a chat",
        description:
          "`scope=me` clears your history and hides the chat until a new message arrives. `scope=all` deletes every message for both people.",
        security,
        params: ChatParams,
        querystring: DeleteChatQuery,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteChat(req.auth.userId, req.params.id, req.query.scope);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    "/messages/:id",
    {
      schema: {
        tags: ["messages"],
        summary: "Edit one of your text messages",
        security,
        params: MessageParams,
        body: EditMessageInput,
        response: { 200: MessageDTO },
      },
    },
    (req) => editMessage(req.auth.userId, req.params.id, req.body),
  );

  app.delete(
    "/messages",
    {
      schema: {
        tags: ["messages"],
        summary: "Delete messages",
        description:
          "`ids` is a comma-separated list (max 100). `scope=me` hides them for you; `scope=all` deletes them for everyone. In direct chats either person can delete any message for everyone.",
        security,
        querystring: DeleteMessagesQuery,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteMessages(req.auth.userId, req.query);
      return reply.status(204).send(null);
    },
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

  app.post(
    "/chats/:id/delivered",
    {
      schema: {
        tags: ["chats"],
        summary: "Acknowledge that this device received messages up to `messageId` (or the latest)",
        description: "Clients call this automatically when they receive someone else's message. Returns null when nothing changed.",
        security,
        params: ChatParams,
        body: MarkDeliveredInput.nullish(),
        response: { 200: ChatDeliveredDTO.nullable() },
      },
    },
    (req) => markDelivered(req.auth.userId, req.params.id, req.body ?? {}),
  );

  app.get(
    "/contacts",
    {
      schema: {
        tags: ["contacts"],
        summary: "People you are connected with, A to Z",
        description: "Everyone you share a direct chat with, including chats with no messages yet. `q` filters by name.",
        security,
        querystring: ContactListQuery,
        response: { 200: page(ContactDTO) },
      },
    },
    (req) => listContacts(req.auth.userId, req.query),
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
