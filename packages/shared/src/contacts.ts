import { z } from "zod";
import { Id } from "./common.js";
import { PublicUser } from "./invites.js";

export const ContactDTO = z.object({
  user: PublicUser,
  chatId: Id,
});
export type ContactDTO = z.infer<typeof ContactDTO>;

export const ContactListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ContactListQuery = z.infer<typeof ContactListQuery>;
