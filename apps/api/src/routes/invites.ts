import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AcceptInviteResult,
  CreateInviteInput,
  InviteDTO,
  InvitePreview,
  PageQuery,
  ReferralDTO,
  page,
} from "@six/shared";
import {
  acceptInvite,
  createInvite,
  listInvites,
  listReferrals,
  previewInvite,
} from "../services/referrals.js";

const Code = z.object({ code: z.string().min(1).max(32) });
const bearer = [{ bearer: [] }];

const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/invites/:code",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["invites"],
        summary: "Public preview of an invite (no auth)",
        params: Code,
        response: { 200: InvitePreview },
      },
    },
    (req) => previewInvite(req.params.code),
  );

  app.register(async (scope) => {
    const authed = scope.withTypeProvider<ZodTypeProvider>();
    authed.addHook("onRequest", app.requireAuth);

    authed.post(
      "/invites",
      {
        schema: {
          tags: ["invites"],
          summary: "Create an invite link",
          security: bearer,
          body: CreateInviteInput,
          response: { 201: InviteDTO },
        },
      },
      async (req, reply) => reply.status(201).send(await createInvite(req.auth.userId, req.body)),
    );

    authed.get(
      "/invites",
      {
        schema: {
          tags: ["invites"],
          summary: "List my invites",
          security: bearer,
          querystring: PageQuery,
          response: { 200: page(InviteDTO) },
        },
      },
      (req) => listInvites(req.auth.userId, req.query),
    );

    authed.post(
      "/invites/:code/accept",
      {
        schema: {
          tags: ["invites"],
          summary: "Accept an invite as an already signed-in user",
          security: bearer,
          params: Code,
          response: { 200: AcceptInviteResult },
        },
      },
      (req) => acceptInvite(req.auth.userId, req.params.code),
    );

    authed.get(
      "/me/referrals",
      {
        schema: {
          tags: ["invites"],
          summary: "People who joined with my invites",
          security: bearer,
          querystring: PageQuery,
          response: { 200: page(ReferralDTO) },
        },
      },
      (req) => listReferrals(req.auth.userId, req.query),
    );
  });
};

export default inviteRoutes;
