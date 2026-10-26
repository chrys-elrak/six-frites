import { z } from "zod";
import { Id, IsoDate } from "./common.js";

export const UserDTO = z.object({
  id: Id,
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  username: z.string().nullable(),
  contactCode: z.string().describe("Share it (or its QR code) so people can find you"),
  findByEmail: z.boolean().describe("Whether people who type your exact email can find you"),
  backupKeyId: z
    .string()
    .nullable()
    .describe("Identifies the key from your recovery key; null until you set up a recovery key"),
  createdAt: IsoDate,
});
export type UserDTO = z.infer<typeof UserDTO>;

export const DeleteAccountInput = z.object({
  confirm: z.literal("DELETE").describe('Type "DELETE" to confirm'),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export const Username = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(USERNAME_PATTERN, "3 to 20 letters, digits or _, starting with a letter"));

export const UpdateMeInput = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  username: Username.nullable().optional(),
  findByEmail: z.boolean().optional(),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;
