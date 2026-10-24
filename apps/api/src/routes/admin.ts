import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AddStickerInput,
  AdminPackQuery,
  AdminReportQuery,
  AdminStatsDTO,
  AdminStickerPackDTO,
  AdminUserDTO,
  AdminUserQuery,
  BanUserInput,
  CreateReportInput,
  CreateStickerPackInput,
  Id,
  ReportDTO,
  ResolveReportInput,
  StickerDTO,
  page,
} from "@six/shared";
import {
  addOfficialSticker,
  adminStats,
  banSticker,
  banStickerPack,
  banUser,
  createOfficialPack,
  getUser,
  listStickerPacks,
  listUsers,
  signOutEverywhere,
  unbanUser,
} from "../services/admin.js";
import { createReport, listReports, resolveReport } from "../services/reports.js";

const Params = z.object({ id: Id });
const security = [{ bearer: [] }];
const tags = ["admin"];

/** Anyone signed in can report; everything under /admin is for the emails in ADMIN_EMAILS. */
export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.post(
    "/reports",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: {
        tags: ["reports"],
        summary: "Report a message or a person to the moderators",
        description:
          "Reporting a message shares it, and the few messages around it, with the moderators. Reporting the same thing twice does nothing.",
        security,
        body: CreateReportInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await createReport(req.auth.userId, req.body);
      return reply.status(204).send(null);
    },
  );
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAdmin);

  app.get(
    "/admin/me",
    {
      schema: {
        tags,
        summary: "Whether you are an admin (403 otherwise)",
        security,
        response: { 200: z.object({ admin: z.literal(true) }) },
      },
    },
    () => ({ admin: true as const }),
  );

  app.get(
    "/admin/stats",
    { schema: { tags, summary: "Platform overview", security, response: { 200: AdminStatsDTO } } },
    () => adminStats(),
  );

  app.get(
    "/admin/users",
    {
      schema: {
        tags,
        summary: "Users, newest first",
        security,
        querystring: AdminUserQuery,
        response: { 200: page(AdminUserDTO) },
      },
    },
    (req) => listUsers(req.query),
  );

  app.get(
    "/admin/users/:id",
    { schema: { tags, summary: "One user", security, params: Params, response: { 200: AdminUserDTO } } },
    (req) => getUser(req.params.id),
  );

  app.post(
    "/admin/users/:id/ban",
    {
      schema: {
        tags,
        summary: "Ban a user",
        description: "Signs them out of every device and blocks signing in again. Their messages stay.",
        security,
        params: Params,
        body: BanUserInput,
        response: { 200: AdminUserDTO },
      },
    },
    (req) => banUser(req.auth.userId, req.params.id, req.body.reason),
  );

  app.post(
    "/admin/users/:id/unban",
    { schema: { tags, summary: "Lift a ban", security, params: Params, response: { 200: AdminUserDTO } } },
    (req) => unbanUser(req.params.id),
  );

  app.post(
    "/admin/users/:id/sign-out",
    {
      schema: {
        tags,
        summary: "Sign a user out of every device",
        security,
        params: Params,
        response: { 200: AdminUserDTO },
      },
    },
    async (req) => {
      await signOutEverywhere(req.params.id);
      return getUser(req.params.id);
    },
  );

  app.get(
    "/admin/reports",
    {
      schema: {
        tags,
        summary: "Reports, newest first",
        security,
        querystring: AdminReportQuery,
        response: { 200: page(ReportDTO) },
      },
    },
    (req) => listReports(req.query),
  );

  app.post(
    "/admin/reports/:id/resolve",
    {
      schema: {
        tags,
        summary: "Handle a report",
        description: "Optionally deletes the reported message for everyone and/or bans the reported person.",
        security,
        params: Params,
        body: ResolveReportInput,
        response: { 200: ReportDTO },
      },
    },
    (req) => resolveReport(req.auth.userId, req.params.id, req.body),
  );

  app.get(
    "/admin/sticker-packs",
    {
      schema: {
        tags,
        summary: "Sticker packs people made (or the official ones), newest first",
        security,
        querystring: AdminPackQuery,
        response: { 200: page(AdminStickerPackDTO) },
      },
    },
    (req) => listStickerPacks(req.query),
  );

  app.post(
    "/admin/sticker-packs",
    {
      schema: {
        tags,
        summary: "Create an official sticker pack",
        description: "Official packs are in everyone's stickers, like the built-in ones.",
        security,
        body: CreateStickerPackInput,
        response: { 201: AdminStickerPackDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await createOfficialPack(req.auth.userId, req.body)),
  );

  app.post(
    "/admin/sticker-packs/:id/stickers",
    {
      schema: {
        tags,
        summary: "Add a sticker to an official pack",
        description: "Upload the file first (kind `sticker`) with your own account.",
        security,
        params: Params,
        body: AddStickerInput,
        response: { 201: StickerDTO },
      },
    },
    async (req, reply) => reply.status(201).send(await addOfficialSticker(req.auth.userId, req.params.id, req.body)),
  );

  app.delete(
    "/admin/sticker-packs/:id",
    {
      schema: {
        tags,
        summary: "Take a sticker pack down",
        description: "Hides the pack, stops its stickers being sent, and blanks them in messages that show them.",
        security,
        params: Params,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await banStickerPack(req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/admin/stickers/:id",
    {
      schema: { tags, summary: "Take one sticker down", security, params: Params, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await banSticker(req.params.id);
      return reply.status(204).send(null);
    },
  );
};

export default adminRoutes;
