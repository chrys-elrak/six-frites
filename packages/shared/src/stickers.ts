import { z } from "zod";
import { Id } from "./common.js";

export const StickerFormat = z.enum(["lottie", "image"]);
export type StickerFormat = z.infer<typeof StickerFormat>;

export const StickerDTO = z.object({
  id: Id,
  packId: Id,
  emoji: z.string(),
  format: StickerFormat.describe("`lottie`: a Lottie JSON animation. `image`: a static WebP or PNG."),
  url: z.string().url().nullable().describe("Null while an uploaded sticker is still being processed"),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type StickerDTO = z.infer<typeof StickerDTO>;

export const StickerPackDTO = z.object({
  id: Id,
  title: z.string(),
  builtin: z.boolean(),
  mine: z.boolean().describe("You created it and can add or remove stickers"),
  saved: z.boolean().describe("It is in your sticker collection (built-in packs always are)"),
  stickers: z.array(StickerDTO),
});
export type StickerPackDTO = z.infer<typeof StickerPackDTO>;

/** Limits on user-made sticker packs. */
export const STICKER_LIMITS = { perPack: 120, packsPerUser: 50 } as const;

export const CreateStickerPackInput = z.object({ title: z.string().trim().min(1).max(64) });
export type CreateStickerPackInput = z.infer<typeof CreateStickerPackInput>;

export const AddStickerInput = z.object({
  uploadId: Id.describe("A completed upload of kind `sticker`"),
  emoji: z.string().trim().min(1).max(16).describe("The emoji this sticker stands for"),
});
export type AddStickerInput = z.infer<typeof AddStickerInput>;

export const GifDTO = z.object({
  id: z.string().describe("Send it with `gifId`"),
  title: z.string(),
  previewUrl: z.string().url().describe("Small animated preview for pickers"),
  width: z.number().int(),
  height: z.number().int(),
});
export type GifDTO = z.infer<typeof GifDTO>;

export const GifQuery = z.object({
  q: z.string().trim().max(100).optional().describe("Search terms; trending GIFs when empty"),
  kind: z
    .enum(["gif", "sticker"])
    .default("gif")
    .describe("`sticker`: transparent animated stickers instead, sent as an image file of the `previewUrl`"),
  cursor: z.string().regex(/^\d+$/).optional(),
});
export type GifQuery = z.infer<typeof GifQuery>;
