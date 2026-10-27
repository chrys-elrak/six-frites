import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { PublicUser } from "./invites.js";

export const ContactDTO = z.object({
  user: PublicUser.describe("With your custom name and photo applied"),
  chatId: Id,
  originalName: z.string().describe("Their own name, or their alias if they don't share it with you"),
  customName: z.string().nullable(),
  hasCustomPhoto: z.boolean(),
  sharingProfile: z.boolean().describe("You show them your real name and photo"),
});
export type ContactDTO = z.infer<typeof ContactDTO>;

export const ShareProfileInput = z.object({ shared: z.boolean() });
export type ShareProfileInput = z.infer<typeof ShareProfileInput>;

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

export const MAX_CONTACT_LINKS = 10;

export const ContactLinkDTO = z.object({
  code: z.string().describe("Works like your contact code, for anyone, until it expires or you delete it"),
  expiresAt: IsoDate.nullable(),
  createdAt: IsoDate,
});
export type ContactLinkDTO = z.infer<typeof ContactLinkDTO>;

export const CreateContactLinkInput = z.object({
  expiresAt: IsoDate.nullable().describe("When it stops working; null keeps it until you delete it"),
});
export type CreateContactLinkInput = z.infer<typeof CreateContactLinkInput>;

export const BlockedUserDTO = z.object({
  user: PublicUser,
  createdAt: IsoDate.describe("When you blocked them"),
});
export type BlockedUserDTO = z.infer<typeof BlockedUserDTO>;
