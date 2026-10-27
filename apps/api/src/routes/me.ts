import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  BlockedUserDTO,
  ContactLinkDTO,
  CreateContactLinkInput,
  DeleteAccountInput,
  AppLockInput,
  UpdateMeInput,
  UserDTO,
} from "@six/shared";
import { z } from "zod";
import { listBlocked } from "../services/blocks.js";
import { createContactLink, deleteContactLink, listContactLinks } from "../services/discovery.js";
import {
  deleteAccount,
  getMe,
  removeAppLock,
  resetContactCode,
  setAppLock,
  unlockApp,
  updateMe,
} from "../services/users.js";

const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.get(
    "/me",
    { schema: { tags: ["me"], summary: "Current user", security: [{ bearer: [] }], response: { 200: UserDTO } } },
    (req) => getMe(req.auth.userId),
  );

  app.patch(
    "/me",
    {
      schema: {
        tags: ["me"],
        summary: "Update profile",
        security: [{ bearer: [] }],
        body: UpdateMeInput,
        response: { 200: UserDTO },
      },
    },
    (req) => updateMe(req.auth.userId, req.body),
  );

  app.post(
    "/me/contact-code",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["me"],
        summary: "Get a new contact code",
        description: "The old code, contact link and QR code stop working. People you're already connected with stay connected.",
        security: [{ bearer: [] }],
        response: { 200: UserDTO },
      },
    },
    (req) => resetContactCode(req.auth.userId),
  );

  app.get(
    "/me/contact-links",
    {
      schema: {
        tags: ["me"],
        summary: "Your contact links that still work",
        security: [{ bearer: [] }],
        response: { 200: z.object({ items: z.array(ContactLinkDTO) }) },
      },
    },
    (req) => listContactLinks(req.auth.userId),
  );

  app.post(
    "/me/contact-links",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["me"],
        summary: "Create a contact link",
        description:
          "Unlike your contact code, which changes once someone uses it, a contact link lets anyone add you until it expires or you delete it.",
        security: [{ bearer: [] }],
        body: CreateContactLinkInput,
        response: { 201: ContactLinkDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await createContactLink(req.auth.userId, req.body.expiresAt)),
  );

  app.delete(
    "/me/contact-links/:code",
    {
      schema: {
        tags: ["me"],
        summary: "Delete a contact link",
        description: "It stops working at once. People who already added you with it stay connected.",
        security: [{ bearer: [] }],
        params: z.object({ code: z.string().min(1).max(32) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteContactLink(req.auth.userId, req.params.code);
      return reply.status(204).send(null);
    },
  );

  app.put(
    "/me/app-lock",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["me"],
        summary: "Turn on the app lock",
        description:
          "The apps then ask for `code` when they open. Sending a new one while the lock is on changes it.",
        security: [{ bearer: [] }],
        body: AppLockInput,
        response: { 200: UserDTO },
      },
    },
    (req) => setAppLock(req.auth.userId, req.body),
  );

  app.delete(
    "/me/app-lock",
    {
      schema: {
        tags: ["me"],
        summary: "Turn off the app lock",
        security: [{ bearer: [] }],
        response: { 200: UserDTO },
      },
    },
    (req) => removeAppLock(req.auth.userId),
  );

  app.post(
    "/me/app-lock/unlock",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["me"],
        summary: "Check the app lock code",
        description: "WRONG_APP_LOCK_CODE if it doesn't match. Always passes when the app lock is off.",
        security: [{ bearer: [] }],
        body: AppLockInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await unlockApp(req.auth.userId, req.body);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/me/blocks",
    {
      schema: {
        tags: ["me"],
        summary: "People you blocked",
        security: [{ bearer: [] }],
        response: { 200: z.object({ items: z.array(BlockedUserDTO) }) },
      },
    },
    (req) => listBlocked(req.auth.userId),
  );

  app.delete(
    "/me",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["me"],
        summary: "Delete your account",
        description:
          'Signs out every device and removes your name, photo, email, contact code, invites, blocks and scheduled messages. Messages you already sent stay in other people\'s chats under "Deleted account". Signing in with the same Google account afterwards creates a new account. Send `{ "confirm": "DELETE" }`.',
        security: [{ bearer: [] }],
        body: DeleteAccountInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteAccount(req.auth.userId);
      return reply.status(204).send(null);
    },
  );
};

export default meRoutes;
