import type { FastifyError } from "fastify";
import fp from "fastify-plugin";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError, type ErrorBody } from "@six/shared";

export default fp(async (app) => {
  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(err.toBody());

    if (hasZodFastifySchemaValidationErrors(err)) {
      const body: ErrorBody = {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed",
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      };
      return reply.status(400).send(body);
    }

    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: err.message } });
    }

    if (isResponseSerializationError(err)) req.log.error({ issues: err.cause.issues }, "response serialization failed");
    else if (!err.statusCode || err.statusCode >= 500) req.log.error(err);

    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    const code = status === 500 ? "INTERNAL" : (err.code ?? "ERROR");
    const message = status === 500 ? "Internal server error" : err.message;
    return reply.status(status).send({ error: { code, message } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.url} not found` } }),
  );
});
