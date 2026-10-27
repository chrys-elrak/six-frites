import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ChatDTO,
  ChatDeliveredDTO,
  ChatListQuery,
  ChatReadDTO,
  CHECKLIST,
  CheckItemInput,
  AddContactInput,
  ContactDTO,
  ShareProfileInput,
  ContactListQuery,
  FindUserQuery,
  FoundUserDTO,
  UpdateContactInput,
  DeleteChatQuery,
  DeleteMessagesQuery,
  EditMessageInput,
  EditScheduledInput,
  Id,
  MarkDeliveredInput,
  MarkReadInput,
  MessageDTO,
  PageQuery,
  ReactInput,
  ReactionEmoji,
  ScheduleMessageInput,
  ScheduledMessageDTO,
  SendMessageInput,
  SyncQuery,
  SyncResult,
  UpdateChatInput,
  ViewMessageResult,
  page,
} from "@six/shared";
import { deleteChat, getChat, listChats, markDelivered, markRead, updateChat } from "../services/chats.js";
import { findContact, listContacts, removeContact, shareProfile, updateContact } from "../services/contacts.js";
import { blockUser, unblockUser } from "../services/blocks.js";
import { addContact, findUser } from "../services/discovery.js";
import {
  checkItem,
  deleteMessages,
  deleteMessagesBetween,
  editMessage,
  listMessages,
  setReaction,
  resendMessage,
  sendMessage,
  viewMessage,
} from "../services/messages.js";
import {
  cancelScheduled,
  editScheduled,
  listScheduled,
  scheduleMessage,
  sendScheduledNow,
} from "../services/scheduled.js";
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
        summary: "Archive, mute or pin a chat, or set its auto-delete timer",
        description:
          "`archived`, `muted` and `pinned` only change your view. `autoDeleteSecs` and `theme` apply to both people and each posts a `service` message: messages sent after an auto-delete change are deleted for everyone that long after sending, and `theme` sets the chat background (null for each person's default).",
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
          "`scope=me` clears your history and hides the chat until a new message arrives. `scope=all` deletes every message for both people. " +
          "With `from` and/or `to`, only the messages sent in that range are deleted, as with DELETE /messages, and the chat stays.",
        security,
        params: ChatParams,
        querystring: DeleteChatQuery,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const { scope, from, to } = req.query;
      if (from || to) await deleteMessagesBetween(req.auth.userId, req.params.id, req.query);
      else await deleteChat(req.auth.userId, req.params.id, scope);
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
    (req) => editMessage(req.auth.userId, req.params.id, req.body, req.auth.sessionId),
  );

  app.post(
    "/messages/:id/reactions",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["messages"],
        summary: "Add a reaction to a message",
        description:
          "You can add several different emoji, up to 10 (REACTION_LIMIT_REACHED). Adding one you already have changes nothing. Both people get message.edited with the new `reactions`. REACTION_NOT_ALLOWED on deleted, destroyed or service messages.",
        security,
        params: MessageParams,
        body: ReactInput,
        response: { 200: MessageDTO },
      },
    },
    (req) => setReaction(req.auth.userId, req.params.id, req.body.emoji, true),
  );

  app.delete(
    "/messages/:id/reactions/:emoji",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["messages"],
        summary: "Remove one of your reactions",
        description: "`emoji` is URL-encoded. Removing one you don't have changes nothing.",
        security,
        params: z.object({ id: Id, emoji: ReactionEmoji }),
        response: { 200: MessageDTO },
      },
    },
    (req) => setReaction(req.auth.userId, req.params.id, req.params.emoji, false),
  );

  app.put(
    "/messages/:id/checklist/:item",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["messages"],
        summary: "Tick or untick a checklist item",
        description:
          "`item` is the index in the checklist's items. Either person can tick any item; both get message.edited with the new `checks`.",
        security,
        params: z.object({ id: Id, item: z.coerce.number().int().min(0).max(CHECKLIST.items - 1) }),
        body: CheckItemInput,
        response: { 200: MessageDTO },
      },
    },
    (req) => checkItem(req.auth.userId, req.params.id, req.params.item, req.body.done),
  );

  app.post(
    "/messages/:id/view",
    {
      schema: {
        tags: ["messages"],
        summary: "Open a self-destructing message",
        description:
          "Returns the content (with download links valid for 5 minutes) and counts a view. Destroys the message once its views run out; with a timer, it is destroyed `ttlSeconds` after the first view. Returns MESSAGE_EXPIRED afterwards. Senders and normal messages are returned without counting.",
        security,
        params: MessageParams,
        response: { 200: ViewMessageResult },
      },
    },
    (req) => viewMessage(req.auth.userId, req.params.id),
  );

  app.post(
    "/messages/:id/resend",
    {
      schema: {
        tags: ["messages"],
        summary: "Let the recipient open a self-destructing message again",
        description:
          "Sender only, after it was opened: re-arms it with the same rule and resets its views. Allowed 3 times, within an hour of it being opened (see ephemeral.resendsLeft and resendUntil).",
        security,
        params: MessageParams,
        response: { 200: MessageDTO },
      },
    },
    (req) => resendMessage(req.auth.userId, req.params.id),
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
        description:
          "Idempotent per `clientId`: retrying with the same clientId returns the original message. Send `encrypted` with one envelope per device of every member (your other devices included, not this one); DEVICES_CHANGED lists what to fix. The first encrypted message turns encryption on for the chat, after which plain text is refused with ENCRYPTION_REQUIRED.",
        security,
        params: ChatParams,
        body: SendMessageInput,
        response: { 201: MessageDTO },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await sendMessage(req.auth.userId, req.params.id, req.body, req.auth.sessionId)),
  );

  app.get(
    "/chats/:id/scheduled-messages",
    {
      schema: {
        tags: ["scheduled"],
        summary: "Your scheduled messages in a chat, soonest first",
        description: "At most 100, so `nextCursor` is always null.",
        security,
        params: ChatParams,
        response: { 200: page(ScheduledMessageDTO) },
      },
    },
    (req) => listScheduled(req.auth.userId, req.params.id),
  );

  app.post(
    "/chats/:id/scheduled-messages",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["scheduled"],
        summary: "Schedule a message",
        description:
          "Same body as sending, plus `sendAt`. Only you see it until then; it is sent as a normal message, with this clientId. Idempotent per `clientId`. Your other devices get `chat.updated` with the new `scheduledCount`.",
        security,
        params: ChatParams,
        body: ScheduleMessageInput,
        response: { 201: ScheduledMessageDTO },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await scheduleMessage(req.auth.userId, req.params.id, req.body, req.auth.sessionId)),
  );

  app.patch(
    "/scheduled-messages/:id",
    {
      schema: {
        tags: ["scheduled"],
        summary: "Change the text or time of a scheduled message",
        security,
        params: MessageParams,
        body: EditScheduledInput,
        response: { 200: ScheduledMessageDTO },
      },
    },
    (req) => editScheduled(req.auth.userId, req.params.id, req.body, req.auth.sessionId),
  );

  app.delete(
    "/scheduled-messages/:id",
    {
      schema: {
        tags: ["scheduled"],
        summary: "Cancel a scheduled message",
        security,
        params: MessageParams,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await cancelScheduled(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/scheduled-messages/:id/send",
    {
      schema: {
        tags: ["scheduled"],
        summary: "Send a scheduled message now",
        security,
        params: MessageParams,
        response: { 200: MessageDTO },
      },
    },
    (req) => sendScheduledNow(req.auth.userId, req.params.id),
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
        description:
          "Clients call this automatically when they receive someone else's message. Returns null when nothing changed.",
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
        description:
          "Everyone you share a direct chat with, including chats with no messages yet. `q` filters by name.",
        security,
        querystring: ContactListQuery,
        response: { 200: page(ContactDTO) },
      },
    },
    (req) => listContacts(req.auth.userId, req.query),
  );

  app.get(
    "/users/find",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["contacts"],
        summary: "Find someone by contact code or contact link",
        description:
          "`q` is a contact code (dashes and spaces ignored) or a contact link or scanned QR (…/add/CODE). " +
          "USER_NOT_FOUND if no one matches, CONTACT_SELF for you.",
        security,
        querystring: FindUserQuery,
        response: { 200: FoundUserDTO },
      },
    },
    (req) => findUser(req.auth.userId, req.query.q),
  );

  app.post(
    "/contacts",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["contacts"],
        summary: "Add someone found with /users/find",
        description: "Takes the same `q`. Opens a direct chat right away, or returns the one you already have.",
        security,
        body: AddContactInput,
        response: { 200: ContactDTO },
      },
    },
    (req) => addContact(req.auth.userId, req.body.q),
  );

  app.post(
    "/users/:id/block",
    {
      schema: {
        tags: ["contacts"],
        summary: "Block someone you share a chat with",
        description:
          "Neither of you can send, react, edit or change the chat's timer or background until you unblock. They see that you blocked them (ChatDTO.blockedByThem), and online status and typing stop flowing both ways. Both get chat.updated.",
        security,
        params: z.object({ id: Id }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await blockUser(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/users/:id/block",
    {
      schema: { tags: ["contacts"], summary: "Unblock someone", security, params: z.object({ id: Id }), response: { 204: z.null() } },
    },
    async (req, reply) => {
      await unblockUser(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/contacts/:userId",
    {
      schema: {
        tags: ["contacts"],
        summary: "One contact, with your custom name and photo",
        security,
        params: z.object({ userId: Id }),
        response: { 200: ContactDTO },
      },
    },
    (req) => findContact(req.auth.userId, req.params.userId),
  );

  app.patch(
    "/contacts/:userId",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      bodyLimit: 128 * 1024,
      schema: {
        tags: ["contacts"],
        summary: "Set the name and/or photo you see for a contact",
        description:
          "Only you see these. `photo` is a base64 JPEG, PNG or WebP data URL of at most 64 KB; send null to go back to their own.",
        security,
        params: z.object({ userId: Id }),
        body: UpdateContactInput,
        response: { 200: ContactDTO },
      },
    },
    (req) => updateContact(req.auth.userId, req.params.userId, req.body),
  );

  app.put(
    "/contacts/:userId/profile",
    {
      schema: {
        tags: ["contacts"],
        summary: "Show or hide your real name and photo to a contact",
        description:
          "Everyone else sees your alias and no photo. Both of you get chat.updated; adding each other again starts hidden.",
        security,
        params: z.object({ userId: Id }),
        body: ShareProfileInput,
        response: { 200: ContactDTO },
      },
    },
    (req) => shareProfile(req.auth.userId, req.params.userId, req.body.shared),
  );

  app.delete(
    "/contacts/:userId",
    {
      schema: {
        tags: ["contacts"],
        summary: "Remove a contact, for both of you",
        description:
          "Deletes your direct chat with its messages and files, and the names and photos you gave each other. " +
          "You disappear from each other's contacts; both get chat.deleted with scope `me`. Either of you can add the other again.",
        security,
        params: z.object({ userId: Id }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await removeContact(req.auth.userId, req.params.userId);
      return reply.status(204).send(null);
    },
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
