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
  askCode: z.string().describe("Your link for anonymous messages is /ask/{askCode} on the web app"),
  backupKeyId: z
    .string()
    .nullable()
    .describe("Identifies the key from your recovery key; null until you set up a recovery key"),
  hasBackupPin: z.boolean().describe("Whether a new device can restore your backup with your 6-digit PIN"),
  hasAppLock: z.boolean().describe("Whether the apps ask for your app lock code when they open"),
  ads: z.boolean().describe("Whether the apps show you ads; admins can turn them off for you"),
  anonBot: z.boolean().describe("Whether the Six Frites bot sends you a question in your anonymous inbox now and then"),
  quickReactions: z.array(z.string()).describe("The emojis offered first when you react, in order; empty means the defaults"),
  guest: z
    .boolean()
    .describe("Signed in without an invite: can only get anonymous messages, send them, and write to support, until joining with an invite"),
  support: z.boolean().describe("Answers the support chats, so the apps don't offer to contact support"),
  chatBan: z
    .object({ until: IsoDate.nullable() })
    .nullable()
    .describe("Banned from chats by a moderator: like a guest, only anonymous messages and support work, until `until` or for good"),
  termsAccepted: z.boolean().describe("Accepted the Terms of Service and Privacy Policy; the apps ask once, before anything else"),
  tourSeen: z.boolean().describe("Went through or skipped the quick tour the apps show once to someone new"),
  locale: z.enum(["en", "fr", "mg"]).nullable().describe("The account's language, which every app follows; null until one is picked"),
  createdAt: IsoDate,
});
export type UserDTO = z.infer<typeof UserDTO>;

/** Guests and people banned from chats only get anonymous messages and support. */
export const isLimited = (u: Pick<UserDTO, "guest" | "chatBan">) => u.guest || u.chatBan !== null;

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
  tourSeen: z.literal(true).optional().describe("Marks the quick tour as seen, so no app shows it again"),
  locale: z.enum(["en", "fr", "mg"]).optional().describe("The language for every app on the account, and for pushes and emails"),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

export const AppLockInput = z.object({ code: z.string().regex(/^\d{4,8}$/, "Use 4 to 8 digits") });
export type AppLockInput = z.infer<typeof AppLockInput>;

export const ContactLabelInput = AppLockInput.extend({ label: z.string().trim().max(200).nullable() });
export type ContactLabelInput = z.infer<typeof ContactLabelInput>;

export const ContactLabelDTO = z.object({ label: z.string().nullable() });
export type ContactLabelDTO = z.infer<typeof ContactLabelDTO>;

const ALIAS_FOODS = ["🍟", "🍔", "🌭", "🍕", "🌮", "🌯", "🥙", "🥪", "🍗", "🍿", "🥨", "🥕", "🥦", "🌽", "🍅", "🥑", "🍆", "🥒", "🧅", "🧄", "🥬", "🍄", "🍠", "🥜"];

/** The picture behind an alias like `#EF4535`: that colour, with a food picked from it. Support sees a potato. */
export function aliasAvatar(name: string): { gradient: string; food: string } | null {
  const hex = /^(Potato )?(#[0-9A-F]{6})$/.exec(name);
  if (!hex) return null;
  const food = hex[1] ? "🥔" : ALIAS_FOODS[parseInt(hex[2]!.slice(1), 16) % ALIAS_FOODS.length]!;
  return { gradient: `linear-gradient(${hex[2]}, ${hex[2]})`, food };
}
