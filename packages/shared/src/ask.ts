import { z } from "zod";
import { Entities, MessageEntity, entitiesFit } from "./chats.js";
import { Id, IsoDate } from "./common.js";
import { ContactPhoto } from "./contacts.js";
import type { Locale } from "./i18n/index.js";
import { splitLinks } from "./links.js";

export const ASK_MAX = 500;
/** How long the prompt someone writes for the top of their link can be. */
export const ASK_PROMPT_MAX = 60;
export const ANON_PHOTO_BYTES = 512 * 1024;
/** Voice messages last a minute at most; the server cuts anything longer. */
export const ANON_VOICE_MS = 60_000;
export const ANON_VOICE_BYTES = 1024 * 1024;

const VISIBLE = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

// ponytail: bare domains are caught by a short TLD list; add TLDs as spam shows up
const BARE_DOMAIN = /\b[a-z0-9-]+\.(com|net|org|io|me|ly|gg|co|app|link|site|xyz|top|info|biz|shop|ru|tk|mg|fr)\b/i;

/**
 * Links are the usual spam in anonymous messages, so they're refused, Six Frites' own invite and ask links
 * included: URLs, www. hosts and bare domains like bit.ly/x.
 */
export const hasLink = (text: string) => splitLinks(text).some((p) => p.href) || BARE_DOMAIN.test(text);

const ASK_IDEAS = {
  en: () => import("./ask-ideas/en.js"),
  fr: () => import("./ask-ideas/fr.js"),
  mg: () => import("./ask-ideas/mg.js"),
};

/**
 * A random question for the top of a link, or message to send through one, never the one already there. The lists
 * are long, so they load the first time someone asks for one instead of with the app.
 */
export async function randomAskIdea(locale: Locale, kind: "prompts" | "messages", current: string) {
  const others = (await ASK_IDEAS[locale]()).default[kind].filter((p) => p !== current);
  return others[Math.floor(Math.random() * others.length)]!;
}

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
  prompt: z.string().nullable().describe("The line at the top of the link; null shows the app's own"),
});
export type AskProfileDTO = z.infer<typeof AskProfileDTO>;

/** The line at the top of a link: short, readable, and with no link in it. */
const PromptText = z
  .string()
  .trim()
  .max(ASK_PROMPT_MAX)
  .refine(visible, "Write something people can read")
  .refine((s) => !hasLink(s), "Links aren't allowed on your link");

/** How long a temporary link can work, in hours, and how many can work at once. */
export const TEMP_LINK_HOURS = [24, 72, 168] as const;
export const TEMP_LINK_MAX = 10;

export const TempLinkDTO = z.object({
  code: z.string(),
  prompt: z.string().nullable().describe("Its title, at the top of the link"),
  expiresAt: IsoDate,
});
export type TempLinkDTO = z.infer<typeof TempLinkDTO>;

export const CreateTempLinkInput = z.object({
  prompt: PromptText.refine((s) => s.length > 0, "Give the link a title").describe("Its title, at the top of the link"),
  hours: z
    .number()
    .int()
    .refine((h) => (TEMP_LINK_HOURS as readonly number[]).includes(h), "Pick 24, 72 or 168 hours"),
});
export type CreateTempLinkInput = z.infer<typeof CreateTempLinkInput>;

export const AskLinkDTO = AskProfileDTO.extend({
  blocked: z.boolean().describe("The signed-in viewer was blocked by this person and can't write to them; false when signed out"),
});
export type AskLinkDTO = z.infer<typeof AskLinkDTO>;

export const UpdateAskProfileInput = z.object({
  name: z
    .string()
    .trim()
    .max(64)
    .refine(visible, "Write a name people can read")
    .refine((s) => !hasLink(s), "Links aren't allowed in names")
    .optional()
    .describe("Shown on your link; empty goes back to your account name"),
  prompt: PromptText.optional().describe("The line at the top of your link, like \"Tell me a secret\"; empty goes back to the app's"),
  photo: ContactPhoto.nullable().optional().describe("A base64 JPEG, PNG or WebP data URL of at most 64 KB; null removes it"),
});
export type UpdateAskProfileInput = z.infer<typeof UpdateAskProfileInput>;

export const SendAnonInput = z
  .object({
    text: z
      .string()
      .trim()
      .max(ASK_MAX)
      .refine(visible, "Write something people can read")
      .refine((s) => !hasLink(s), "Links aren't allowed in anonymous messages")
      .default(""),
    entities: Entities.optional(),
    photo: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Expected a base64 JPEG, PNG or WebP data URL")
      .refine((s) => Math.floor(((s.length - s.indexOf(",") - 1) * 3) / 4) <= ANON_PHOTO_BYTES, "Photo is larger than 512 KB")
      .optional()
      .describe("A photo, re-encoded by the app so it carries no place or camera details"),
    gifId: z.string().min(1).max(100).optional().describe("A GIF from GET /v1/gifs, sent instead of a photo"),
    voice: z
      .string()
      .regex(/^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/]+=*$/, "Expected a base64 audio data URL")
      .refine((s) => Math.floor(((s.length - s.indexOf(",") - 1) * 3) / 4) <= ANON_VOICE_BYTES, "Voice message is larger than 1 MB")
      .optional()
      .describe("A voice message, recorded with or without a voice effect; the server keeps its first minute"),
  })
  .refine((v) => v.text || v.photo || v.gifId || v.voice, "Write something, or add a photo, a GIF or a voice message")
  .refine((v) => [v.photo, v.gifId, v.voice].filter(Boolean).length <= 1, {
    message: "Send one photo, GIF or voice message at a time",
    path: ["photo"],
  })
  .refine((v) => entitiesFit(v.text, v.entities), { message: "Entities fall outside the text", path: ["entities"] });
export type SendAnonInput = z.infer<typeof SendAnonInput>;

export const AnonMessageDTO = z.object({
  id: Id,
  text: z.string().describe("Empty when only a photo, a GIF or a voice message was sent"),
  prompt: z.string().nullable().describe("The prompt on the link when it was sent; null for the app's own"),
  entities: z.array(MessageEntity).describe("Bold, italic, strike, code and spoiler ranges of the text"),
  photoUrl: z.string().url().nullable(),
  gif: z
    .object({ url: z.string().url(), width: z.number().int().nullable(), height: z.number().int().nullable() })
    .nullable()
    .describe("A GIF, as an MP4 to play muted on a loop"),
  voice: z
    .object({ url: z.string().url(), durationMs: z.number().int(), waveform: z.array(z.number().int().min(0).max(100)) })
    .nullable()
    .describe("A voice message, as AAC in MP4"),
  createdAt: IsoDate,
  oldLink: z.boolean().describe("Came through a link the recipient has since replaced; always false on sent messages"),
  bot: z.boolean().describe("A question from the Six Frites bot, not from a person"),
});
export type AnonMessageDTO = z.infer<typeof AnonMessageDTO>;

export const AnonBotInput = z.object({ on: z.boolean() });
export type AnonBotInput = z.infer<typeof AnonBotInput>;

export const SentAnonDTO = AnonMessageDTO.extend({ to: AskProfileDTO.describe("Who you sent it to, as their link shows them") });
export type SentAnonDTO = z.infer<typeof SentAnonDTO>;

/** The link people open to send you anonymous messages, on the web app at `origin`. */
export const askUrl = (origin: string, code: string) => `${origin}/ask/${code}`;
