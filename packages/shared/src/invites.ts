import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import type { Dict } from "./i18n/index.js";

export const PublicUser = z.object({
  id: Id,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
});
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

export const AcceptInviteResult = z.object({
  referrer: PublicUser,
});
export type AcceptInviteResult = z.infer<typeof AcceptInviteResult>;

function inviteState(i: InviteDTO, t: Dict) {
  if (i.status === "revoked") return t.settings.revoked;
  if (i.status === "exhausted") return t.settings.usedUp;
  if (!i.expiresAt) return t.settings.neverExpires;
  const hours = (Date.parse(i.expiresAt) - Date.now()) / 36e5;
  if (hours <= 0) return t.settings.expired;
  return t.settings.expiresIn(
    hours < 24 ? t.time.duration(Math.ceil(hours), "hour") : t.time.duration(Math.ceil(hours / 24), "day"),
  );
}

/** "2 of 5 joined · Expires in 3 days", or why the link no longer works. */
export function inviteSummary(i: InviteDTO, t: Dict) {
  const uses = i.maxUses === null ? t.settings.joined(i.uses) : t.settings.usesOf(i.uses, i.maxUses);
  return `${uses} · ${inviteState(i, t)}`;
}
