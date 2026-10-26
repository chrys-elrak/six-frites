import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { BlockedUserDTO, DeleteAccountInput, UpdateMeInput, UserDTO } from "@six/shared";
import { z } from "zod";
import { listBlocked } from "../services/blocks.js";
import { deleteAccount, getMe, resetContactCode, updateMe } from "../services/users.js";

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
        description: "`username` is stored lowercase without the @; USERNAME_TAKEN if someone has it.",
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
        description: "The old code, contact link and QR code stop working.",
        security: [{ bearer: [] }],
        response: { 200: UserDTO },
      },
    },
    (req) => resetContactCode(req.auth.userId),
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
          'Signs out every device and removes your name, photo, email, username, contact code, invites, blocks and scheduled messages. Messages you already sent stay in other people\'s chats under "Deleted account". Signing in with the same Google account afterwards creates a new account. Send `{ "confirm": "DELETE" }`.',
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
