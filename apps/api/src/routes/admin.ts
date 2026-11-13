import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AddStickerInput,
  AdminAnonDTO,
  AnnounceInput,
  AnnounceResult,
  AnnouncementDTO,
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
  StorageLimitInput,
  MapsLimitInput,
  UserUsageDTO,
  UsageQuery,
  StickerDTO,
  page,
  AdminMailDTO,
  AdminMailQuery,
  AdminMailStats,
  ImportStickersInput,
  StickerImportDTO,
  UnfinishedZipDTO,
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
  setStorageLimit,
  setMapsLimit,
  giveFullAccess,
  signOutEverywhere,
  unbanUser,
  verifyAdminCode,
} from "../services/admin.js";
import { adminTwoFactor } from "../plugins/auth.js";
import { listAnonForAdmin } from "../services/ask.js";
import { cancelStickerImport, dropUnfinishedZip, latestStickerImport, startStickerImport, stickerImportProgress } from "../services/sticker-import.js";
import { createReport, listReports, resolveReport } from "../services/reports.js";
import { listMailLog, mailStats } from "../services/emails.js";
import { usageOf } from "../services/usage.js";
import { announce, listAnnouncements } from "../services/bot.js";

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
    "/admin/users/:id/storage-limit",
    {
      schema: {
        tags,
        summary: "Cap the space a user's uploads may take, or lift the cap",
        description: "Once full they can still send text, GIFs and stickers; new uploads fail with STORAGE_FULL.",
        security,
        params: Params,
        body: StorageLimitInput,
        response: { 200: AdminUserDTO },
      },
    },
    (req) => setStorageLimit(req.params.id, req.body.limitMb),
  );

  app.get(
    "/admin/users/:id/usage",
    {
      schema: {
        tags,
        summary: "How a user used the app: time in it, by screen and hour, and calls to the API",
        description: "Kept 90 days.",
        security,
        params: Params,
        querystring: UsageQuery,
        response: { 200: UserUsageDTO },
      },
    },
    (req) => usageOf(req.params.id, req.query.days),
  );

  app.post(
    "/admin/users/:id/maps-limit",
    {
      schema: {
        tags,
        summary: "Cap the calls a user makes to Google Maps each month, or lift the cap",
        description:
          "Past it their place search uses OpenStreetMap, and map pictures and the map picker answer MAP_LIMIT_REACHED so the apps draw OpenStreetMap.",
        security,
        params: Params,
        body: MapsLimitInput,
        response: { 200: AdminUserDTO },
      },
    },
    (req) => setMapsLimit(req.params.id, req.body.limit),
  );

  app.post(
    "/admin/users/:id/full-access",
    {
      schema: {
        tags,
        summary: "Give a guest or someone on the waiting list full access",
        description: "They get a notification and an email. Nothing happens if they already had full access.",
        security,
        params: Params,
        response: { 200: AdminUserDTO },
      },
    },
    (req) => giveFullAccess(req.params.id),
  );

  app.post(
    "/admin/announcements",
    {
      schema: {
        tags,
        summary: "Send a message to every member",
        description:
          "Six Frites News posts the text in each member's chat with it, which comes back for anyone who deleted it, with the usual notification. Nobody can reply there. With `email`, it also goes by email to members who haven't turned emails off, after this answers. Guests, banned and waiting accounts are left out. Sending the same text again the same day only reaches the members it missed, and the same email subject only the members not emailed yet.",
        security,
        body: AnnounceInput,
        response: { 200: AnnounceResult },
      },
    },
    async (req) => announce(req.body),
  );

  app.get(
    "/admin/announcements",
    {
      schema: {
        tags,
        summary: "What Six Frites News has posted",
        description:
          "Newest first, up to 100: the announcements admins sent and the release notes posted when a version was published. Read back from members' chats, so one that every member has deleted no longer shows.",
        security,
        response: { 200: z.array(AnnouncementDTO) },
      },
    },
    () => listAnnouncements(),
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
        description: "`unfinished` lists your zip uploads that never finished; drop them with DELETE /v1/admin/sticker-packs/uploads/{id}.",
        security,
        response: { 200: z.object({ import: StickerImportDTO.nullable(), unfinished: z.array(UnfinishedZipDTO) }) },
      },
    },
    (req) => latestStickerImport(req.auth.userId),
  );

  app.delete(
    "/admin/sticker-packs/uploads/:id",
    {
      schema: { tags, summary: "Throw away a sticker zip upload that never finished", security, params: Params, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await dropUnfinishedZip(req.auth.userId, req.params.id);
      return reply.status(204).send(null);
    },
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
