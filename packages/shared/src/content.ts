import { z } from "zod";
import { Id } from "./common.js";
import { Checklist, GeoPoint, MessageEntity, entitiesFit } from "./chats.js";

const B64 = (bytes: number) => z.string().regex(new RegExp(`^[\\w-]{${Math.ceil((bytes * 4) / 3)}}$`));

/** What the recipient needs to fetch, check, decrypt and preview an encrypted file. */
export const EncryptedFile = z.object({
  key: B64(32).describe("The file key from @six/crypto encryptMedia"),
  digest: B64(32).describe("SHA-256 of the encrypted bytes"),
  name: z.string().max(200),
  mime: z.string().max(100),
  size: z.number().int().min(0).describe("Size of the decrypted file"),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  waveform: z.array(z.number().int().min(0).max(100)).max(100).nullable().optional(),
  thumb: z
    .string()
    .max(24_000)
    .nullable()
    .optional()
    .describe("A small JPEG preview as a data: URL, shown until the file is downloaded"),
  sticker: z.boolean().optional().describe("A sticker sent from the keyboard, shown without a bubble"),
});
export type EncryptedFile = z.infer<typeof EncryptedFile>;

/**
 * The plaintext inside every envelope and backup of an encrypted message. `chatId` and `clientId`
 * bind it to one message, so the server cannot move it into another message or chat.
 */
export const MessageContent = z
  .object({
    v: z.literal(1),
    chatId: Id,
    clientId: z.string().min(1).max(64),
    text: z.string().max(4000).optional(),
    entities: z.array(MessageEntity).max(100).optional(),
    spoiler: z.boolean().optional(),
    file: EncryptedFile.optional(),
    location: GeoPoint.optional(),
    checklist: Checklist.optional(),
    replyText: z.string().max(200).nullable().optional().describe("What the quoted message said, as the sender saw it"),
  })
  .refine((c) => entitiesFit(c.text ?? "", c.entities), { message: "Entities fall outside the text", path: ["entities"] });
export type MessageContent = z.infer<typeof MessageContent>;
