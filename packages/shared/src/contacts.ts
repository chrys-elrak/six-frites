import { z } from "zod";
import { Id } from "./common.js";
import { PublicUser } from "./invites.js";

export const ContactDTO = z.object({
  user: PublicUser.describe("With your custom name and photo applied"),
  chatId: Id,
  originalName: z.string(),
  customName: z.string().nullable(),
  hasCustomPhoto: z.boolean(),
});
export type ContactDTO = z.infer<typeof ContactDTO>;

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
