import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Id, PokeInput, PokeResult } from "@six/shared";
import { prisma } from "../lib/prisma.js";
import { mailStrings, page } from "../mail/templates.js";
import { checkUnsubscribe, pokeUser, unsubscribe } from "../services/emails.js";

const UnsubscribeQuery = z.object({ u: z.string(), t: z.string() });

const mailRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => done(null, body));

  app.post(
    "/users/:id/poke",
    {
      onRequest: app.requireAuth,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["contacts"],
        summary: "Poke a contact by email to come and talk",
        description:
          "Sends them an email with a link to your chat and, if given, your few words. 10 pokes a day (POKE_LIMIT_REACHED), 5 of them to the same person (POKE_PERSON_LIMIT_REACHED), an hour apart (ALREADY_POKED). POKE_UNAVAILABLE when they can't get one: blocked, gone, or emails turned off.",
        security: [{ bearer: [] }],
        params: z.object({ id: Id }),
        body: PokeInput,
        response: { 200: PokeResult },
      },
    },
    (req) => pokeUser(req.auth.userId, req.params.id, req.body.message),
  );

  const unsubscribePage = async (query: z.infer<typeof UnsubscribeQuery>, done: boolean) => {
    const user = await prisma.user.findUnique({ where: { id: query.u }, select: { locale: true } });
    const t = mailStrings(user?.locale);
    const lang = user?.locale ?? "en";
    if (!user || !checkUnsubscribe(query.u, query.t)) return page({ lang, title: t.unsubscribeTitle, body: t.badLink });
    if (done) {
      await unsubscribe(query.u);
      return page({ lang, title: t.unsubscribeTitle, body: t.unsubscribeDone });
    }
    return page({ lang, title: t.unsubscribeTitle, body: t.unsubscribeBody, button: t.unsubscribe });
  };

  app.get(
    "/mail/unsubscribe",
    { schema: { hide: true, querystring: UnsubscribeQuery } },
    async (req, reply) => reply.type("text/html").send(await unsubscribePage(req.query, false)),
  );

  app.post(
    "/mail/unsubscribe",
    { schema: { hide: true, querystring: UnsubscribeQuery } },
    async (req, reply) => reply.type("text/html").send(await unsubscribePage(req.query, true)),
  );
};

export default mailRoutes;
