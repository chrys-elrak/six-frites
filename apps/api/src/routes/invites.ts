import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AcceptInviteResult,
  InviteDTO,
  InvitePreview,
  PageQuery,
  ReferralDTO,
  page,
} from "@six/shared";
import {
  acceptInvite,
  getInvite,
  listInvites,
  listReferrals,
  previewInvite,
  resetInvite,
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

    authed.get(
      "/me/invite",
      {
        schema: {
          tags: ["invites"],
          summary: "Your invite link",
          description: "Everyone has exactly one. It's made on first call, never expires and has no use limit.",
          security: bearer,
          response: { 200: InviteDTO },
        },
      },
      (req) => getInvite(req.auth.userId),
    );

    authed.post(
      "/me/invite/reset",
      {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
        schema: {
          tags: ["invites"],
          summary: "Get a new invite link",
          description: "The old link stops working. People who already joined with it stay.",
          security: bearer,
          response: { 200: InviteDTO },
        },
      },
      (req) => resetInvite(req.auth.userId),
    );

    authed.post(
      "/invites",
      {
        schema: {
          tags: ["invites"],
          summary: "Your invite link (deprecated)",
          description: "Kept for older apps: returns the same link as GET /me/invite. The body is ignored.",
          deprecated: true,
          security: bearer,
          body: z.object({}).passthrough().optional(),
          response: { 200: InviteDTO },
        },
      },
      (req) => getInvite(req.auth.userId),
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
