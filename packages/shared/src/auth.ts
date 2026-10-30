import { z } from "zod";
import { Id, IsoDate, Platform } from "./common.js";
import { UserDTO } from "./users.js";

export const DeviceInfo = z.object({
  platform: Platform,
  name: z.string().max(100).optional(),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

export const GoogleLoginInput = z.object({
  idToken: z.string().min(1),
  inviteCode: z.string().min(1).optional(),
  support: z
    .boolean()
    .optional()
    .describe("Signing in from the support page: without an invite you get a guest account that can only write to support"),
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
