import { z } from "zod";
import { Id } from "./common.js";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const UploadKind = z.enum(["image", "video", "voice", "file"]);
export type UploadKind = z.infer<typeof UploadKind>;

export const UploadStatus = z.enum(["pending", "processing", "ready", "failed"]);
export type UploadStatus = z.infer<typeof UploadStatus>;

/** Content types accepted per kind. Anything goes for plain files, which are only ever downloaded. */
export const ACCEPTED_TYPES: Record<Exclude<UploadKind, "file">, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
  voice: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav"],
};

const MimeType = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[\w.+-]+\/[\w.+-]+$/, "Invalid content type");

export const PresignUploadInput = z
  .object({
    kind: UploadKind,
    name: z.string().trim().min(1).max(200),
    mime: z.preprocess((v) => (typeof v === "string" ? v.split(";")[0] : v), MimeType),
    size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  })
  .refine((v) => v.kind === "file" || ACCEPTED_TYPES[v.kind].includes(v.mime), {
    message: "This file type is not supported for that kind of upload",
    path: ["mime"],
  });
export type PresignUploadInput = z.infer<typeof PresignUploadInput>;

export const AttachmentDTO = z.object({
  id: Id,
  kind: UploadKind,
  status: UploadStatus,
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
  url: z.string().url().nullable().describe("Signed link to the playable or viewable file, once ready"),
  thumbUrl: z.string().url().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  waveform: z.array(z.number().int().min(0).max(100)).nullable(),
});
export type AttachmentDTO = z.infer<typeof AttachmentDTO>;

export const PresignUploadResult = z.object({
  upload: AttachmentDTO,
  url: z.string().url().describe("PUT the file here within 15 minutes"),
  headers: z.record(z.string()).describe("Send these headers with the PUT"),
});
export type PresignUploadResult = z.infer<typeof PresignUploadResult>;
