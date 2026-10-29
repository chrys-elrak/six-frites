import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { QUICK_REACTIONS, ReactionEmoji } from "./chats.js";
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
  hasBackupPin: z.boolean().describe("Whether a new device can restore your backup with your 6-digit PIN"),
  hasAppLock: z.boolean().describe("Whether the apps ask for your app lock code when they open"),
  ads: z.boolean().describe("Whether the apps show you ads; admins can turn them off for you"),
  quickReactions: z.array(z.string()).describe("The emojis offered first when you react, in order; empty means the defaults"),
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
  quickReactions: z
    .array(ReactionEmoji)
    .length(QUICK_REACTIONS.length)
    .refine((a) => new Set(a).size === a.length, "Pick each emoji once")
    .optional()
    .describe("Your own quick reactions; send the defaults to go back to them"),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

export const AppLockInput = z.object({ code: z.string().regex(/^\d{4,8}$/, "Use 4 to 8 digits") });
export type AppLockInput = z.infer<typeof AppLockInput>;

export const ContactLabelInput = AppLockInput.extend({ label: z.string().trim().max(200).nullable() });
export type ContactLabelInput = z.infer<typeof ContactLabelInput>;

export const ContactLabelDTO = z.object({ label: z.string().nullable() });
export type ContactLabelDTO = z.infer<typeof ContactLabelDTO>;

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
