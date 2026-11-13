import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "./env.js";
import authPlugin from "./plugins/auth.js";
import { countCall } from "./services/usage.js";
import errorsPlugin from "./plugins/errors.js";
import adminRoutes, { adminSignInRoutes, reportRoutes } from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import callRoutes from "./routes/calls.js";
import chatRoutes from "./routes/chats.js";
import deviceRoutes from "./routes/devices.js";
import inviteRoutes from "./routes/invites.js";
import linkRoutes from "./routes/links.js";
import meRoutes from "./routes/me.js";
import sessionRoutes from "./routes/sessions.js";
import presenceRoutes from "./routes/presence.js";
import appRoutes from "./routes/releases.js";
import pushRoutes from "./routes/push.js";
import stickerRoutes from "./routes/stickers.js";
import storyRoutes from "./routes/stories.js";
import uploadRoutes from "./routes/uploads.js";
import askRoutes from "./routes/ask.js";
import notificationRoutes from "./routes/notifications.js";
import mailRoutes from "./routes/mail.js";
import emojiRoutes from "./routes/emoji.js";
import groupRoutes, { groupLinkRoutes } from "./routes/groups.js";

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: "info" },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorsPlugin);
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(","),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.headers.authorization?.slice(-32) ?? req.ip,
    allowList: () => env.NODE_ENV === "test",
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Six Frites API", version: "1.0.0" },
      servers: [{ url: env.PUBLIC_URL }],
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(authPlugin);
  app.addHook("onResponse", async (req) => {
    if (req.auth?.userId && req.routeOptions.url) countCall(req.auth.userId, `${req.method} ${req.routeOptions.url}`);
  });

  app.get("/health", { schema: { hide: true, response: { 200: z.object({ ok: z.boolean() }) } } }, () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" });
      await v1.register(adminSignInRoutes);
      await v1.register(adminRoutes);
      await v1.register(reportRoutes);
      await v1.register(appRoutes);
      await v1.register(meRoutes);
      await v1.register(sessionRoutes);
      await v1.register(inviteRoutes);
      await v1.register(chatRoutes);
      await v1.register(deviceRoutes);
      await v1.register(callRoutes);
      await v1.register(uploadRoutes);
      await v1.register(pushRoutes);
      await v1.register(presenceRoutes);
      await v1.register(stickerRoutes);
      await v1.register(storyRoutes);
      await v1.register(linkRoutes);
      await v1.register(askRoutes);
      await v1.register(notificationRoutes);
      await v1.register(mailRoutes);
      await v1.register(groupRoutes);
      await v1.register(groupLinkRoutes);
      await v1.register(emojiRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
