import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AddStickerInput,
  AdminAnonDTO,
  AdminAnonQuery,
  AdminCodeInput,
  AdminMeDTO,
  AdminPackQuery,
  AdminSecretDTO,
  AdminReportQuery,
  AdminStatsDTO,
  AdminStickerPackDTO,
  AdminUserDTO,
  AdminUserQuery,
  BanUserInput,
  CreateReportInput,
  CreateStickerPackInput,
  Id,
  InviteLimitInput,
  AdminLargeFileDTO,
  PageQuery,
  ReportDTO,
  ResolveReportInput,
  SetAdsInput,
  StickerDTO,
  page,
  AdminMailDTO,
  AdminMailQuery,
  AdminMailStats,
  ImportStickersInput,
  StickerImportDTO,
} from "@six/shared";
import {
  addOfficialSticker,
  adminStats,
  banSticker,
  banStickerPack,
  deleteOfficialPack,
  banUser,
  createOfficialPack,
  removeLargeFile,
  getUser,
  listLargeFiles,
  listStickerPacks,
  listUsers,
  newAdminSecret,
  setAds,
  setInviteLimit,
  signOutEverywhere,
  unbanUser,
  verifyAdminCode,
} from "../services/admin.js";
import { adminTwoFactor } from "../plugins/auth.js";
import { listAnonForAdmin } from "../services/ask.js";
import { cancelStickerImport, latestStickerImport, startStickerImport, stickerImportProgress } from "../services/sticker-import.js";
import { createReport, listReports, resolveReport } from "../services/reports.js";
import { listMailLog, mailStats } from "../services/emails.js";

const Params = z.object({ id: Id });
const security = [{ bearer: [] }];
const tags = ["admin"];

/** Anyone signed in can report; everything under /admin is for the emails in ADMIN_EMAILS. */
export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.post(
    "/reports",
    {
      config: { guest: true, rateLimit: { max: 20, timeWindow: "1 hour" } },
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

/** What an admin can reach before entering an authenticator code: who they are, and the code itself. */
export const adminSignInRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAdminSignIn);

  app.get(
    "/admin/me",
    {
      schema: {
        tags,
        summary: "Whether you are an admin (403 otherwise), and whether moderation still wants an authenticator code",
        security,
        response: { 200: AdminMeDTO },
      },
    },
    async (req) => ({ admin: true as const, twoFactor: await adminTwoFactor(req.auth.sessionId) }),
  );

  app.post(
    "/admin/2fa/secret",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "A new authenticator secret, for an admin who has none yet",
        description: "Nothing is saved until a code made from it is sent to POST /v1/admin/2fa.",
        security,
        response: { 200: AdminSecretDTO },
      },
    },
    (req) => newAdminSecret(req.auth.userId),
  );

  app.post(
    "/admin/2fa",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags,
        summary: "Enter an authenticator code to open moderation on this session for 12 hours",
        description: "The first time, also send the secret the code was made from. Each code works once.",
        security,
        body: AdminCodeInput,
        response: { 200: AdminMeDTO },
      },
    },
    (req) => verifyAdminCode(req.auth.userId, req.auth.sessionId, req.body),
  );
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAdmin);

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
        description: "Signs them out of every device and blocks signing in again, for `hours` or until lifted. Their messages stay.",
        security,
        params: Params,
        body: BanUserInput,
        response: { 200: AdminUserDTO },
      },
    },
    (req) => banUser(req.auth.userId, req.params.id, req.body.reason, req.body.hours, req.body.scope),
  );

  app.post(
    "/admin/users/:id/unban",
    { schema: { tags, summary: "Lift a ban", security, params: Params, response: { 200: AdminUserDTO } } },
    (req) => unbanUser(req.params.id),
  );

  app.post(
    "/admin/users/:id/invite-limit",
    {
      schema: {
        tags,
        summary: "Change how many people a user can invite",
        description: "People waiting on their links get in, oldest first, as far as the new limit allows.",
        security,
        params: Params,
        body: InviteLimitInput,
        response: { 200: AdminUserDTO },
      },
    },
    (req) => setInviteLimit(req.params.id, req.body.limit),
  );

  app.post(
    "/admin/users/ads",
    {
      schema: {
        tags,
        summary: "Turn ads on or off for some users",
        security,
        body: SetAdsInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await setAds(req.body.userIds, req.body.ads);
      return reply.status(204).send(null);
    },
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
    "/admin/anon",
    {
      schema: {
        tags,
        summary: "Anonymous messages, newest first, deleted ones included",
        description: "Shows who sent each one; senders are told moderators can see this.",
        security,
        querystring: AdminAnonQuery,
        response: { 200: page(AdminAnonDTO) },
      },
    },
    (req) => listAnonForAdmin(req.query),
  );

  app.get(
    "/admin/emails",
    {
      schema: {
        tags,
        summary: "Emails the app sent or tried to send, newest first",
        description: "Pokes, reminders to people who went quiet, and nudges for guests to share their link. Kept 90 days.",
        security,
        querystring: AdminMailQuery,
        response: { 200: page(AdminMailDTO) },
      },
    },
    (req) => listMailLog(req.query),
  );

  app.get(
    "/admin/emails/stats",
    { schema: { tags, summary: "Emails sent, failed and skipped in the last day", security, response: { 200: AdminMailStats } } },
    () => mailStats(),
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
    "/admin/sticker-packs/import",
    {
      schema: {
        tags,
        summary: "Import a zip of stickers into official packs",
        description:
          "Upload the zip first (kind `sticker_zip`). The server unpacks it in the background: each folder becomes an official pack named after it, loose files a pack named after the zip, more than 120 stickers several packs. Follow it with GET /v1/admin/sticker-packs/import/{uploadId}.",
        security,
        body: ImportStickersInput,
        response: { 202: StickerImportDTO },
      },
    },
    async (req, reply) => reply.status(202).send(await startStickerImport(req.auth.userId, req.body.uploadId)),
  );

  app.get(
    "/admin/sticker-packs/import",
    {
      schema: {
        tags,
        summary: "Your latest sticker zip import, running or finished in the last day",
        security,
        response: { 200: z.object({ import: StickerImportDTO.nullable() }) },
      },
    },
    (req) => latestStickerImport(req.auth.userId),
  );

  app.post(
    "/admin/sticker-packs/import/:uploadId/cancel",
    {
      schema: {
        tags,
        summary: "Stop a sticker zip import; the packs it made so far stay",
        security,
        params: z.object({ uploadId: Id }),
        response: { 200: StickerImportDTO },
      },
    },
    (req) => cancelStickerImport(req.auth.userId, req.params.uploadId),
  );

  app.delete(
    "/admin/sticker-packs/:id/forever",
    {
      schema: {
        tags,
        summary: "Delete an official pack for good",
        description: "Removes the pack, its stickers and their files. Refused when any of its stickers was sent; take it down instead.",
        security,
        params: Params,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await deleteOfficialPack(req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/admin/sticker-packs/import/:uploadId",
    {
      schema: {
        tags,
        summary: "How a sticker zip import is going",
        security,
        params: z.object({ uploadId: Id }),
        response: { 200: StickerImportDTO },
      },
    },
    (req) => stickerImportProgress(req.auth.userId, req.params.uploadId),
  );

  app.post(
    "/admin/sticker-packs/:id/stickers",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
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

  app.get(
    "/admin/large-files",
    {
      schema: {
        tags,
        summary: "Files over 100 MB, newest first",
        description: "These are uploaded unencrypted, so they can be removed to free space.",
        security,
        querystring: PageQuery,
        response: { 200: page(AdminLargeFileDTO) },
      },
    },
    (req) => listLargeFiles(req.query),
  );

  app.delete(
    "/admin/large-files/:id",
    {
      schema: {
        tags,
        summary: "Remove a large file",
        description: "Deletes it from storage; the messages that carried it say it was removed for being too large.",
        security,
        params: Params,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await removeLargeFile(req.params.id);
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
