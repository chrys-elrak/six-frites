import { z } from "zod";
import { Entities, MessageEntity, entitiesFit } from "./chats.js";
import { Id, IsoDate } from "./common.js";
import { ContactPhoto } from "./contacts.js";
import { splitLinks } from "./links.js";

export const ASK_MAX = 500;
export const ANON_PHOTO_BYTES = 512 * 1024;

const VISIBLE = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

// ponytail: bare domains are caught by a short TLD list; add TLDs as spam shows up
const BARE_DOMAIN = /\b[a-z0-9-]+\.(com|net|org|io|me|ly|gg|co|app|link|site|xyz|top|info|biz|shop|ru|tk)\b/i;

/** Links are the usual spam in anonymous messages, so they're refused: URLs, www. hosts and bare domains like bit.ly/x. */
export const hasLink = (text: string) => splitLinks(text).some((p) => p.href) || BARE_DOMAIN.test(text);

const visible = (s: string) => !s || VISIBLE.test(s);

/** The header gradients a shared message card can wear, first one by default. */
export const ASK_COLORS = [
  ["#f59e0b", "#e11d48"],
  ["#ec4899", "#f97316"],
  ["#8b5cf6", "#ec4899"],
  ["#3b82f6", "#06b6d4"],
  ["#10b981", "#84cc16"],
  ["#f43f5e", "#be123c"],
  ["#1c1917", "#57534e"],
] as const;
export type AskColors = (typeof ASK_COLORS)[number];

export const AskProfileDTO = z.object({
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
});
export type AskProfileDTO = z.infer<typeof AskProfileDTO>;

export const UpdateAskProfileInput = z.object({
  name: z
    .string()
    .trim()
    .max(64)
    .refine(visible, "Write a name people can read")
    .refine((s) => !hasLink(s), "Links aren't allowed in names")
    .optional()
    .describe("Shown on your link; empty goes back to your account name"),
  photo: ContactPhoto.nullable().optional().describe("A base64 JPEG, PNG or WebP data URL of at most 64 KB; null removes it"),
});
export type UpdateAskProfileInput = z.infer<typeof UpdateAskProfileInput>;

export const SendAnonInput = z
  .object({
    text: z.string().trim().max(ASK_MAX).refine(visible, "Write something people can read").default(""),
    entities: Entities.optional(),
    photo: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Expected a base64 JPEG, PNG or WebP data URL")
      .refine((s) => Math.floor(((s.length - s.indexOf(",") - 1) * 3) / 4) <= ANON_PHOTO_BYTES, "Photo is larger than 512 KB")
      .optional()
      .describe("A photo, re-encoded by the app so it carries no place or camera details"),
  })
  .refine((v) => v.text || v.photo, "Write something or add a photo")
  .refine((v) => entitiesFit(v.text, v.entities), { message: "Entities fall outside the text", path: ["entities"] });
export type SendAnonInput = z.infer<typeof SendAnonInput>;

export const AnonMessageDTO = z.object({
  id: Id,
  text: z.string().describe("Empty when only a photo was sent"),
  entities: z.array(MessageEntity).describe("Bold, italic, strike, code and spoiler ranges of the text"),
  photoUrl: z.string().url().nullable(),
  createdAt: IsoDate,
});
export type AnonMessageDTO = z.infer<typeof AnonMessageDTO>;

export const SentAnonDTO = AnonMessageDTO.extend({ to: AskProfileDTO.describe("Who you sent it to, as their link shows them") });
export type SentAnonDTO = z.infer<typeof SentAnonDTO>;

/** The link people open to send you anonymous messages, on the web app at `origin`. */
export const askUrl = (origin: string, code: string) => `${origin}/ask/${code}`;
