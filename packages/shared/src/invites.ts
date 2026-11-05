import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import type { Dict } from "./i18n/index.js";

export const PublicUser = z
  .object({
    id: Id,
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    alias: z
      .string()
      .optional()
      .describe("Their alias, when you gave them a name of your own: without a photo, their picture still comes from it"),
  })
  .describe("Their alias and no photo, unless they share their profile with you");
export type PublicUser = z.infer<typeof PublicUser>;

export const MAX_INVITE_USES = 10;
export const MAX_INVITE_DAYS = 30;
export const MAX_INVITE_MESSAGE = 500;

export const CreateInviteInput = z.object({
  message: z
    .string()
    .trim()
    .max(MAX_INVITE_MESSAGE)
    .optional()
    .describe("Shown to whoever opens the link, before they sign in"),
  maxUses: z
    .number()
    .int()
    .min(1)
    .max(MAX_INVITE_USES)
    .default(1)
    .describe("How many new accounts can be made with it"),
  expiresInDays: z.number().int().min(1).max(MAX_INVITE_DAYS).default(7),
});
export type CreateInviteInput = z.infer<typeof CreateInviteInput>;

export const InviteStatus = z.enum(["valid", "expired", "exhausted", "revoked"]);
export type InviteStatus = z.infer<typeof InviteStatus>;

export const InviteDTO = z.object({
  code: z.string(),
  message: z.string().nullable(),
  maxUses: z.number().int().nullable(),
  uses: z.number().int().describe("Accounts made with it; people who already had one don't count"),
  expiresAt: IsoDate.nullable(),
  status: InviteStatus,
  createdAt: IsoDate,
});
export type InviteDTO = z.infer<typeof InviteDTO>;

export const InvitePreview = z.object({
  code: z.string(),
  inviter: PublicUser,
  message: z.string().nullable(),
  status: InviteStatus,
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export const ReferralDTO = z.object({
  id: Id,
  user: PublicUser,
  inviteCode: z.string(),
  createdAt: IsoDate,
});
export type ReferralDTO = z.infer<typeof ReferralDTO>;

export const InviteQuota = z.object({
  limit: z.number().int().nullable().describe("How many people your links can bring in; null means no limit"),
  invited: z.number().int().describe("People who joined with your links"),
  waiting: z.number().int().describe("People who signed up with your links after you hit the limit"),
  held: z.number().int().describe("Places your links that still work keep for people who haven't joined yet"),
});
export type InviteQuota = z.infer<typeof InviteQuota>;

/** How many people a new link can be for: what my limit leaves after who joined and what my links hold. */
export const invitePlacesLeft = (q: InviteQuota) =>
  q.limit === null ? MAX_INVITE_USES : Math.max(0, Math.min(MAX_INVITE_USES, q.limit - q.invited - q.waiting - q.held));

export const AcceptInviteResult = z.object({
  referrer: PublicUser,
});
export type AcceptInviteResult = z.infer<typeof AcceptInviteResult>;

function inviteState(i: InviteDTO, t: Dict) {
  if (i.status === "revoked") return t.settings.revoked;
  if (i.status === "exhausted") return t.settings.usedUp;
  if (!i.expiresAt) return t.settings.neverExpires;
  return expiryLabel(i.expiresAt, t);
}

/** "Expires in 5 hours", "Expires in 3 days", or "Expired". */
export function expiryLabel(expiresAt: string, t: Dict) {
  const hours = (Date.parse(expiresAt) - Date.now()) / 36e5;
  if (hours <= 0) return t.settings.expired;
  return t.settings.expiresIn(
    hours < 24 ? t.time.duration(Math.ceil(hours), "hour") : t.time.duration(Math.ceil(hours / 24), "day"),
  );
}

/** Why I can't make another link, or null when I can. */
export function inviteLimitNote(q: InviteQuota, t: Dict) {
  if (invitePlacesLeft(q) > 0) return null;
  return q.limit !== null && q.invited + q.waiting >= q.limit ? t.settings.inviteLimitReached : t.settings.placesHeld;
}

/** "3 of 10 invites used · 4 held by your links · 2 waiting", or null when there's no limit. */
export function quotaSummary(q: InviteQuota, t: Dict) {
  if (q.limit === null) return null;
  return [
    t.settings.invitesUsed(q.invited, q.limit),
    q.held && t.settings.invitesHeld(q.held),
    q.waiting && t.settings.invitesWaiting(q.waiting),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "2 of 5 joined · Expires in 3 days", or why the link no longer works. */
export function inviteSummary(i: InviteDTO, t: Dict) {
  const uses = i.maxUses === null ? t.settings.joined(i.uses) : t.settings.usesOf(i.uses, i.maxUses);
  return `${uses} · ${inviteState(i, t)}`;
}
