import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AcceptInviteResult,
  CreateInviteInput,
  InviteDTO,
  InvitePreview,
  InviteQuota,
  PageQuery,
  ReferralDTO,
  page,
} from "@six/shared";
import {
  acceptInvite,
  createInvite,
  inviteQuota,
  listInvites,
  listReferrals,
  previewInvite,
  revokeInvite,
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
        config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
        schema: {
          tags: ["invites"],
          summary: "Create an invite link",
          description:
            "Only new accounts count towards maxUses. Someone who already has an account can still open it to add you.",
          security: bearer,
          body: CreateInviteInput,
          response: { 201: InviteDTO },
        },
      },
      async (req, reply) => reply.status(201).send(await createInvite(req.auth.userId, req.body)),
    );

    authed.post(
      "/invites/:code/revoke",
      {
        schema: {
          tags: ["invites"],
          summary: "Revoke one of your invite links",
          description: "Nobody can use it any more. People who already joined with it stay connected.",
          security: bearer,
          params: Code,
          response: { 200: InviteDTO },
        },
      },
      (req) => revokeInvite(req.auth.userId, req.params.code),
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
      "/me/invite-quota",
      {
        schema: {
          tags: ["invites"],
          summary: "How many people my links can still bring in",
          description: "Past the limit, people who sign up with my links wait until an admin raises it.",
          security: bearer,
          response: { 200: InviteQuota },
        },
      },
      (req) => inviteQuota(req.auth.userId),
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
