import { z } from "zod";
import { Id } from "./common.js";

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

/** Bigger files are uploaded as they are: encrypting means holding the whole file in memory. */
export const ENCRYPT_MAX_BYTES = 100 * 1024 * 1024;

/** What @six/crypto encryptMedia adds to a file: a 16-byte prefix and a 16-byte tag per 64 KB chunk. */
export const encryptedSize = (plainBytes: number) => 16 + plainBytes + 16 * Math.max(1, Math.ceil(plainBytes / 65536));

export const ENCRYPTED_MIME = "application/octet-stream";

/** Squeezes a waveform into at most `count` bars, keeping each group's peak, so it fits a message bubble. */
export function fitWaveform(bars: number[], count = 48) {
  if (bars.length <= count) return bars;
  return Array.from({ length: count }, (_, i) =>
    Math.max(...bars.slice(Math.floor((i * bars.length) / count), Math.floor(((i + 1) * bars.length) / count))),
  );
}

export const UploadKind = z
  .enum(["image", "video", "video_note", "voice", "file", "gif", "sticker"])
  .describe("`gif` uploads are only created by sending a `gifId`; `sticker` files go into sticker packs");
export type UploadKind = z.infer<typeof UploadKind>;

/** Stickers are small: a Lottie animation (.tgs or .json) or a static WebP/PNG. */
export const STICKER_MAX_BYTES = 512 * 1024;

export const UploadStatus = z
  .enum(["pending", "processing", "ready", "failed", "removed"])
  .describe("`removed`: a large file a moderator deleted to free space");
export type UploadStatus = z.infer<typeof UploadStatus>;

/** Content types accepted per kind. Anything goes for plain files, which are only ever downloaded. */
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];

export const ACCEPTED_TYPES: Record<Exclude<UploadKind, "file">, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: VIDEO_TYPES,
  video_note: VIDEO_TYPES,
  voice: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav"],
  gif: [],
  sticker: ["application/x-tgsticker", "application/json", "image/webp", "image/png"],
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
    encrypted: z
      .boolean()
      .optional()
      .describe(
        `The file is encrypted end to end: send mime ${ENCRYPTED_MIME} and a neutral name. The server stores it as-is, with no thumbnail or processing`,
      ),
    multipart: z
      .boolean()
      .optional()
      .describe("The client can send a file bigger than one part as several parts at once: the result then has `parts` instead of `url`"),
  })
  .refine((v) => !v.encrypted || v.mime === ENCRYPTED_MIME, {
    message: `Encrypted files use ${ENCRYPTED_MIME}`,
    path: ["mime"],
  })
  .refine((v) => !v.encrypted || v.size <= encryptedSize(ENCRYPT_MAX_BYTES), {
    message: "Files over 100 MB are sent unencrypted",
    path: ["size"],
  })
  .refine((v) => !v.encrypted || (v.kind !== "gif" && v.kind !== "sticker"), {
    message: "GIFs and stickers are not encrypted",
    path: ["kind"],
  })
  .refine((v) => v.encrypted || v.kind === "file" || ACCEPTED_TYPES[v.kind].includes(v.mime), {
    message: "This file type is not supported for that kind of upload",
    path: ["mime"],
  })
  .refine((v) => v.kind !== "sticker" || v.size <= STICKER_MAX_BYTES, {
    message: "Stickers can be at most 512 KB",
    path: ["size"],
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
  encrypted: z.boolean().describe("The file is encrypted; its key, name, type and preview are in the message content"),
});
export type AttachmentDTO = z.infer<typeof AttachmentDTO>;

export const PresignUploadResult = z.object({
  upload: AttachmentDTO,
  url: z.string().url().optional().describe("PUT the file here within 15 minutes"),
  parts: z
    .array(z.string().url())
    .optional()
    .describe("PUT bytes [i * partSize, (i + 1) * partSize) of the file to parts[i], several at once; each link works for a day"),
  partSize: z.number().int().optional(),
  headers: z.record(z.string(), z.string()).describe("Send these headers with every PUT"),
});
export type PresignUploadResult = z.infer<typeof PresignUploadResult>;
