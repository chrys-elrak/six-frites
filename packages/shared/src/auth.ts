import { z } from "zod";
import { Id, IsoDate, Platform } from "./common.js";
import { UserDTO } from "./users.js";

export const DeviceInfo = z.object({
  platform: Platform,
  name: z.string().max(100).optional(),
  id: z
    .string()
    .regex(/^[\w-]{16,64}$/)
    .optional()
    .describe("A random ID the app keeps for this browser or phone; bans and anonymous blocks also cover other accounts used on it"),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

export const GoogleLoginInput = z.object({
  idToken: z.string().min(1),
  inviteCode: z.string().min(1).optional(),
  guest: z
    .boolean()
    .optional()
    .describe("Without an invite, give me a guest account (anonymous messages and support only) instead of INVITE_REQUIRED"),
  device: DeviceInfo,
});
export type GoogleLoginInput = z.infer<typeof GoogleLoginInput>;

export const RefreshInput = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof RefreshInput>;

export const AuthTokens = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: IsoDate,
  refreshToken: z.string().optional(),
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const AuthResult = AuthTokens.extend({ user: UserDTO });
export type AuthResult = z.infer<typeof AuthResult>;

export const SessionDTO = z.object({
  id: Id,
  platform: Platform,
  deviceName: z.string().nullable(),
  createdAt: IsoDate,
  lastUsedAt: IsoDate,
  current: z.boolean(),
});
export type SessionDTO = z.infer<typeof SessionDTO>;

export const LinkTicket = z.object({
  id: Id,
  secret: z.string(),
  expiresAt: IsoDate,
});
export type LinkTicket = z.infer<typeof LinkTicket>;

export const StartLinkInput = z.object({ device: DeviceInfo });
export type StartLinkInput = z.infer<typeof StartLinkInput>;

export const ClaimLinkInput = z.object({ id: Id, secret: z.string().min(1).max(100) });
export type ClaimLinkInput = z.infer<typeof ClaimLinkInput>;

export const LinkClaim = z.discriminatedUnion("status", [
  z.object({ status: z.literal("waiting") }),
  AuthResult.extend({
    status: z.literal("linked"),
    sealedKey: z
      .string()
      .nullable()
      .describe("The account's backup key, sealed by the phone to the one-time key in the QR code; the server can't open it"),
  }),
]);
export type LinkClaim = z.infer<typeof LinkClaim>;

export const LinkPreview = z.object({ platform: Platform, deviceName: z.string().nullable() });
export type LinkPreview = z.infer<typeof LinkPreview>;

export const ApproveLinkInput = z.object({
  secret: z.string().min(1).max(100),
  sealedKey: z.string().max(500).nullable(),
});
export type ApproveLinkInput = z.infer<typeof ApproveLinkInput>;
