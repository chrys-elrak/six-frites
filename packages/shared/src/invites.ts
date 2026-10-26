import { z } from "zod";
import { Id, IsoDate } from "./common.js";

export const PublicUser = z.object({
  id: Id,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
});
export type PublicUser = z.infer<typeof PublicUser>;

export const InviteDTO = z.object({
  code: z.string(),
  maxUses: z.number().int().nullable(),
  uses: z.number().int(),
  expiresAt: IsoDate.nullable(),
  createdAt: IsoDate,
});
export type InviteDTO = z.infer<typeof InviteDTO>;

export const InviteStatus = z.enum(["valid", "expired", "exhausted"]);
export type InviteStatus = z.infer<typeof InviteStatus>;

export const InvitePreview = z.object({
  code: z.string(),
  inviter: PublicUser,
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
