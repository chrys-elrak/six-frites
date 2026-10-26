import { z } from "zod";
import { Id, IsoDate } from "./common.js";

export const APK_MIME = "application/vnd.android.package-archive";
export const MAX_APK_BYTES = 300 * 1024 * 1024;

export const AppReleaseDTO = z.object({
  id: Id,
  version: z.string(),
  notes: z.string().nullable(),
  size: z.number().int(),
  published: z.boolean().describe("Uploaded and offered for download"),
  createdAt: IsoDate,
});
export type AppReleaseDTO = z.infer<typeof AppReleaseDTO>;

export const LatestAppDTO = z.object({
  version: z.string(),
  notes: z.string().nullable(),
  size: z.number().int(),
  publishedAt: IsoDate,
  downloadUrl: z.string().url().describe("Stable link that always gets the newest version"),
});
export type LatestAppDTO = z.infer<typeof LatestAppDTO>;

export const CreateReleaseInput = z.object({
  version: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(2000).optional(),
  size: z.number().int().min(1).max(MAX_APK_BYTES),
});
export type CreateReleaseInput = z.infer<typeof CreateReleaseInput>;

export const CreatedReleaseDTO = z.object({
  release: AppReleaseDTO,
  url: z.string().url().describe("PUT the APK here"),
  headers: z.record(z.string(), z.string()),
});
export type CreatedReleaseDTO = z.infer<typeof CreatedReleaseDTO>;
