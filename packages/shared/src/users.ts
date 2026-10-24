import { z } from "zod";
import { Id, IsoDate } from "./common.js";

export const UserDTO = z.object({
  id: Id,
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  createdAt: IsoDate,
});
export type UserDTO = z.infer<typeof UserDTO>;

export const UpdateMeInput = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;
