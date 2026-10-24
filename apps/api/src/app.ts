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
import errorsPlugin from "./plugins/errors.js";
import authRoutes from "./routes/auth.js";
import inviteRoutes from "./routes/invites.js";
import meRoutes from "./routes/me.js";
import sessionRoutes from "./routes/sessions.js";

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: "info" },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorsPlugin);
  await app.register(cors, { origin: env.WEB_ORIGIN.split(","), credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
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

  app.get("/health", { schema: { hide: true, response: { 200: z.object({ ok: z.boolean() }) } } }, () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" });
      await v1.register(meRoutes);
      await v1.register(sessionRoutes);
      await v1.register(inviteRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
