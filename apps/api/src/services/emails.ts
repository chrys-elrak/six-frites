import { createHmac, timingSafeEqual } from "node:crypto";
import { type AdminMailQuery, AppError, FRITE_BOT_ID, MAIL_KINDS, MAIL_STATUSES, POKE_LIMITS, askUrl } from "@six/shared";
import { env, isProd } from "../env.js";
import { presenceOf } from "../lib/presence.js";
import { prisma } from "../lib/prisma.js";
import { type Layout, layout, mailStrings, plain } from "../mail/templates.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { blockState } from "./blocks.js";
import { profilesFor } from "./contacts.js";
import { mailEnabled, sendMail } from "./mailer.js";
import { toUserRef } from "./reports.js";

const DAY = 24 * 60 * 60 * 1000;
/** How long someone stays away before the app emails them, and how often a guest is reminded to share their link. */
export const INACTIVE_AFTER_MS = DAY;
export const ANON_NUDGE_EVERY_MS = 4 * DAY;
/** Emails per kind per sweep; fewer while developing, since they all land in one inbox. */
const BATCH = isProd ? 50 : 5;

const webUrl = () => env.WEB_ORIGIN.split(",")[0]!;
const assets = () => env.MAIL_ASSETS_URL ?? webUrl();

const sign = (userId: string) => createHmac("sha256", env.JWT_SECRET).update(`unsubscribe:${userId}`).digest("base64url");

export const unsubscribeUrl = (userId: string) => `${env.PUBLIC_URL}/v1/mail/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;

export function checkUnsubscribe(userId: string, token: string) {
  const want = Buffer.from(sign(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function unsubscribe(userId: string) {
  await prisma.user.updateMany({ where: { id: userId }, data: { mailOptOut: true } });
}

type Recipient = { id: string; email: string; locale: string | null };
type MailKind = (typeof MAIL_KINDS)[number];

/** Sends one of the app's emails and writes down how it went. Returns whether it was sent. */
async function deliver(
  user: Recipient,
  m: Omit<Layout, "assets" | "lang" | "unsubscribe">,
  subject: string,
  log: { kind: MailKind; fromId?: string },
) {
  const t = mailStrings(user.locale);
  const unsubscribe = unsubscribeUrl(user.id);
  const full: Layout = { ...m, assets: assets(), lang: user.locale ?? "en", unsubscribe: { prompt: t.stop, label: t.unsubscribe, href: unsubscribe } };
  const entry = { kind: log.kind, subject, to: user.email, userId: user.id, fromId: log.fromId ?? null };
  try {
    const sentTo = await sendMail({ to: user.email, subject, html: layout(full), text: plain(full), unsubscribe });
    const status = sentTo ? "sent" : "skipped";
    await prisma.mailLog.create({ data: { ...entry, status, sentTo: sentTo && sentTo !== user.email ? sentTo : null } });
    return status === "sent";
  } catch (err) {
    const error = (err as Error).message.slice(0, 500);
    console.error(`${log.kind} mail to ${user.id} failed:`, error);
    await prisma.mailLog.create({ data: { ...entry, status: "failed", error } }).catch(() => null);
    return false;
  }
}

/** The email log for the admin page, newest first. */
export async function listMailLog(q: AdminMailQuery) {
  const match = { contains: q.q ?? "", mode: "insensitive" as const };
  const rows = await prisma.mailLog.findMany({
    where: {
      ...(q.kind && { kind: q.kind }),
      ...(q.status && { status: q.status }),
      ...(q.q && { OR: [{ to: match }, { user: { displayName: match } }] }),
    },
    include: { user: true, from: true },
    ...pageArgs(q),
  });
  return toPage(rows, q, (r) => ({
    id: r.id,
    kind: r.kind as MailKind,
    status: r.status as (typeof MAIL_STATUSES)[number],
    subject: r.subject,
    to: r.to,
    sentTo: r.sentTo,
    error: r.error,
    recipient: r.user && toUserRef(r.user),
    sender: r.from && toUserRef(r.from),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** How many emails were sent, failed and skipped in the last day. */
export async function mailStats() {
  const rows = await prisma.mailLog.groupBy({ by: ["status"], where: { createdAt: { gt: new Date(Date.now() - DAY) } }, _count: true });
  const count = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { sent: count("sent"), failed: count("failed"), skipped: count("skipped") };
}

/**
 * Emails a contact that `fromId` wants to talk, with a few words if given. Someone can send 10 pokes a day, at most 5
 * to the same person and an hour apart; nobody blocked, gone or who turned emails off can be poked.
 */
export async function pokeUser(fromId: string, toId: string, message?: string) {
  if (fromId === toId || toId === FRITE_BOT_ID) throw new AppError("POKE_UNAVAILABLE");
  const chat = await prisma.chat.findUnique({ where: { directKey: [fromId, toId].sort().join(":") }, select: { id: true } });
  if (!chat) throw new AppError("CONTACT_NOT_FOUND");
  const [target, blocks] = await Promise.all([
    prisma.user.findUnique({ where: { id: toId }, select: { id: true, email: true, locale: true, deletedAt: true, bannedAt: true, mailOptOut: true } }),
    blockState(prisma, fromId, toId),
  ]);
  if (!target || target.deletedAt || target.bannedAt || target.mailOptOut || blocks.byMe || blocks.byThem) {
    throw new AppError("POKE_UNAVAILABLE");
  }

  const since = new Date(Date.now() - DAY);
  const [sent, toThem, recent] = await Promise.all([
    prisma.poke.count({ where: { fromId, createdAt: { gt: since } } }),
    prisma.poke.count({ where: { fromId, toId, createdAt: { gt: since } } }),
    prisma.poke.count({ where: { fromId, toId, createdAt: { gt: new Date(Date.now() - POKE_LIMITS.gapMinutes * 60 * 1000) } } }),
  ]);
  if (sent >= POKE_LIMITS.perDay) throw new AppError("POKE_LIMIT_REACHED");
  if (toThem >= POKE_LIMITS.perPersonPerDay) throw new AppError("POKE_PERSON_LIMIT_REACHED");
  if (recent) throw new AppError("ALREADY_POKED");

  await prisma.poke.create({ data: { fromId, toId, message: message || null } });
  const from = (await profilesFor(prisma, toId, [fromId]))(await prisma.user.findUniqueOrThrow({ where: { id: fromId } }));
  const t = mailStrings(target.locale).poke;
  const name = from.displayName;
  void deliver(
    target,
    {
      preheader: message || t.body(name),
      badge: { name },
      title: t.title(name),
      paragraphs: [t.body(name)],
      quote: message ? { label: t.says(name), text: message } : undefined,
      cta: { label: t.cta, href: `${webUrl()}/chats/${chat.id}` },
      why: t.why(name),
    },
    t.subject(name),
    { kind: "poke", fromId },
  );
  return { remaining: POKE_LIMITS.perDay - sent - 1 };
}

const reachable = { deletedAt: null, bannedAt: null, queuedAt: null, mailOptOut: false, id: { not: FRITE_BOT_ID } };

/** Members who have been away for a day and weren't told since they last came: one email per absence. */
async function emailInactive() {
  const cutoff = new Date(Date.now() - INACTIVE_AFTER_MS);
  const rows = await prisma.$queryRaw<Recipient[]>`
    SELECT "id", "email", "locale" FROM "User"
    WHERE NOT "guest" AND "deletedAt" IS NULL AND "bannedAt" IS NULL AND "queuedAt" IS NULL AND NOT "mailOptOut"
      AND "id" <> ${FRITE_BOT_ID}
      AND COALESCE("lastSeenAt", "createdAt") < ${cutoff}
      AND ("inactiveMailAt" IS NULL OR "inactiveMailAt" < COALESCE("lastSeenAt", "createdAt"))
    ORDER BY COALESCE("lastSeenAt", "createdAt") DESC
    LIMIT ${BATCH}`;
  const online = new Set((await presenceOf(rows.map((r) => r.id))).filter((p) => p.online).map((p) => p.userId));
  let sent = 0;
  for (const user of rows) {
    if (online.has(user.id)) continue;
    const t = mailStrings(user.locale).inactive;
    const ok = await deliver(
      user,
      { preheader: t.body, badge: { emoji: "🍟" }, title: t.title, paragraphs: [t.body], cta: { label: t.cta, href: webUrl() }, why: t.why },
      t.subject,
      { kind: "inactive" },
    );
    if (!ok) continue;
    await prisma.user.update({ where: { id: user.id }, data: { inactiveMailAt: new Date() } });
    sent++;
  }
  return sent;
}

/** Guests who only have an anonymous link, every few days, unless messages came in lately: a nudge to share it. */
async function emailGuests() {
  const now = Date.now();
  const users = await prisma.user.findMany({
    where: {
      ...reachable,
      guest: true,
      createdAt: { lt: new Date(now - DAY) },
      OR: [{ anonMailAt: null }, { anonMailAt: { lt: new Date(now - ANON_NUDGE_EVERY_MS) } }],
      anonReceived: { none: { createdAt: { gt: new Date(now - 2 * DAY) }, senderId: { not: null } } },
    },
    select: { id: true, email: true, locale: true, askCode: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  let sent = 0;
  for (const user of users) {
    const t = mailStrings(user.locale).anon;
    const link = askUrl(webUrl(), user.askCode);
    const ok = await deliver(
      user,
      {
        preheader: t.body,
        badge: { emoji: "🎭" },
        title: t.title,
        paragraphs: [t.body],
        box: { label: t.link, text: link },
        cta: { label: t.cta, href: `${webUrl()}/inbox` },
        why: t.why,
      },
      t.subject,
      { kind: "anon" },
    );
    if (!ok) continue;
    await prisma.user.update({ where: { id: user.id }, data: { anonMailAt: new Date() } });
    sent++;
  }
  return sent;
}

/** Tells someone an admin gave them full access, unless they turned emails off. */
export async function emailFullAccess(userId: string) {
  const user = await prisma.user.findFirst({ where: { ...reachable, id: userId }, select: { id: true, email: true, locale: true } });
  if (!user) return;
  const t = mailStrings(user.locale).access;
  await deliver(
    user,
    { preheader: t.body, badge: { emoji: "🎉" }, title: t.title, paragraphs: [t.body], cta: { label: t.cta, href: webUrl() }, why: t.why },
    t.subject,
    { kind: "access" },
  );
}

/** The worker's hourly round of reminder emails. */
export async function sendDueEmails() {
  const { count: forgotten } = await prisma.mailLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * DAY) } } });
  if (!mailEnabled) return { inactive: 0, guests: 0, forgotten };
  return { inactive: await emailInactive(), guests: await emailGuests(), forgotten };
}
