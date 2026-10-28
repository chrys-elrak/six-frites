import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { ContactPhoto } from "./contacts.js";

export const UserDTO = z.object({
  id: Id,
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  contactCode: z.string().describe("Share it (or its QR code) so people can find you"),
  backupKeyId: z
    .string()
    .nullable()
    .describe("Identifies the key from your recovery key; null until you set up a recovery key"),
  alias: z.string().describe("What people see instead of your name and photo, until you share them"),
  hasBackupPin: z.boolean().describe("Whether a new device can restore your backup with your 6-digit PIN"),
  hasAppLock: z.boolean().describe("Whether the apps ask for your app lock code when they open"),
  ads: z.boolean().describe("Whether the apps show you ads; admins can turn them off for you"),
  createdAt: IsoDate,
});
export type UserDTO = z.infer<typeof UserDTO>;

export const DeleteAccountInput = z.object({
  confirm: z.literal("DELETE").describe('Type "DELETE" to confirm'),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;

export const UpdateMeInput = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  photo: ContactPhoto.nullable()
    .optional()
    .describe("A base64 JPEG, PNG or WebP data URL of at most 64 KB; null removes your photo"),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

export const AppLockInput = z.object({ code: z.string().regex(/^\d{4,8}$/, "Use 4 to 8 digits") });
export type AppLockInput = z.infer<typeof AppLockInput>;

const ALIAS_GRADIENTS = [
  ["#f97316", "#c2410c"],
  ["#f43f5e", "#be123c"],
  ["#3b82f6", "#1d4ed8"],
  ["#10b981", "#047857"],
  ["#8b5cf6", "#6d28d9"],
  ["#ec4899", "#be185d"],
  ["#14b8a6", "#0f766e"],
  ["#f59e0b", "#b45309"],
] as const;

export function aliasAvatar(name: string): { number: string; gradient: string } | null {
  const number = /^Frite (\d+)$/.exec(name)?.[1];
  if (!number) return null;
  const [from, to] = ALIAS_GRADIENTS[Number(number) % ALIAS_GRADIENTS.length]!;
  return { number, gradient: `linear-gradient(135deg, ${from}, ${to})` };
}
