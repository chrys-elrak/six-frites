import { z } from "zod";

export const Id = z.string().min(1);
export const IsoDate = z.string().datetime();

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const Platform = z.enum(["web", "ios", "android"]);
export type Platform = z.infer<typeof Platform>;

/** The longest your display name, or the name you give a contact, can be. */
export const NAME_MAX = 32;
/** The longest a private label on a contact can be. */
export const LABEL_MAX = 60;
