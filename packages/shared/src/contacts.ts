import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { PublicUser } from "./invites.js";

export const ContactDTO = z.object({
  user: PublicUser.describe("With your custom name and photo applied"),
  chatId: Id,
  originalName: z.string().describe("Their alias, or the name of an account like Frite Bot that shows its own"),
  customName: z.string().nullable(),
  hasCustomPhoto: z.boolean(),
});
export type ContactDTO = z.infer<typeof ContactDTO>;

/** How many pokes someone can send a day in all and to one person, and how long between two to the same person. */
export const POKE_LIMITS = { perDay: 10, perPersonPerDay: 5, gapMinutes: 60, message: 200 } as const;

export const PokeInput = z.object({
  message: z.string().trim().max(POKE_LIMITS.message).optional().describe("A few words added to the email"),
});
export type PokeInput = z.infer<typeof PokeInput>;

export const PokeResult = z.object({ remaining: z.number().int().describe("Pokes left today") });
export type PokeResult = z.infer<typeof PokeResult>;


export const ContactListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ContactListQuery = z.infer<typeof ContactListQuery>;

export const MAX_CONTACT_PHOTO_BYTES = 64 * 1024;

export const ContactPhoto = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Expected a base64 JPEG, PNG or WebP data URL")
  .refine((s) => Math.floor(((s.length - s.indexOf(",") - 1) * 3) / 4) <= MAX_CONTACT_PHOTO_BYTES, "Photo is larger than 64 KB");

export const UpdateContactInput = z
  .object({
    displayName: z.string().trim().min(1).max(64).nullable().optional(),
    photo: ContactPhoto.nullable().optional(),
  })
  .refine((v) => v.displayName !== undefined || v.photo !== undefined, "Provide displayName and/or photo");
export type UpdateContactInput = z.infer<typeof UpdateContactInput>;

export const FindUserQuery = z.object({
  q: z.string().trim().min(1).max(320).describe("A contact code or contact link"),
});
export type FindUserQuery = z.infer<typeof FindUserQuery>;

export const FoundUserDTO = z.object({
  user: PublicUser.describe("With your custom name and photo applied if you already know them"),
  chatId: Id.nullable().describe("Your direct chat with them, if you already have one"),
});
export type FoundUserDTO = z.infer<typeof FoundUserDTO>;

export const AddContactInput = FindUserQuery;
export type AddContactInput = FindUserQuery;

export const MAX_CONTACT_LINKS = 1;

/** How long a contact link works at most. */
export const CONTACT_LINK_DAYS = 7;
export const MAX_CONTACT_LINK_USES = 10;

export const ContactLinkDTO = z.object({
  code: z.string().describe("Works like your contact code, for anyone, until it expires or you delete it"),
  expiresAt: IsoDate,
  maxUses: z.number().int().nullable().describe("How many people can add you with it; null for anyone"),
  uses: z.number().int().describe("People who added you with it; ones you were already connected with don't count"),
  createdAt: IsoDate,
});
export type ContactLinkDTO = z.infer<typeof ContactLinkDTO>;

export const CreateContactLinkInput = z.object({
  expiresAt: IsoDate.nullable()
    .optional()
    .describe("When it stops working, at most 7 days from now, which is also what leaving it out gives"),
  maxUses: z
    .number()
    .int()
    .min(1)
    .max(MAX_CONTACT_LINK_USES)
    .nullable()
    .optional()
    .describe("It expires once that many people added you with it; null or left out for anyone"),
});
export type CreateContactLinkInput = z.infer<typeof CreateContactLinkInput>;

export const BlockedUserDTO = z.object({
  user: PublicUser,
  createdAt: IsoDate.describe("When you blocked them"),
});
export type BlockedUserDTO = z.infer<typeof BlockedUserDTO>;
