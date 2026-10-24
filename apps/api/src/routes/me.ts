import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { UpdateMeInput, UserDTO } from "@six/shared";
import { getMe, resetContactCode, updateMe } from "../services/users.js";

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
};

export default meRoutes;
