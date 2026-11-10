import { z } from "zod";
import type { MessageEntity } from "./chats.js";
import { LOCALES } from "./i18n/index.js";

export const LinkPreviewQuery = z.object({
  url: z
    .string()
    .max(2000)
    .regex(/^https?:\/\/\S+$/i),
});
export type LinkPreviewQuery = z.infer<typeof LinkPreviewQuery>;

export const LinkPreviewDTO = z.object({
  siteName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  image: z
    .string()
    .nullable()
    .describe("A small WebP of the page's picture as a data: URL, so readers never contact the site themselves"),
});
export type LinkPreviewDTO = z.infer<typeof LinkPreviewDTO>;

export const ResolvedLinkDTO = z.object({
  url: z.string().nullable().describe("The link without who shared it; null when a share link can't be followed"),
});
export type ResolvedLinkDTO = z.infer<typeof ResolvedLinkDTO>;

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>"'.,;:!?)\]}]/gi;

const TRACKING: [host: RegExp, param: RegExp][] = [
  [/./, /^(utm_\w+|fbclid|gclid|dclid|msclkid|igsh|igshid|mibextid)$/i],
  [/(^|\.)(tiktok\.com|instagram\.com|threads\.net)$/i, /./],
  [/(^|\.)(facebook\.com|fb\.watch)$/i, /^(rdid|share_url|sfnsn|ref|__cft__.*|__tn__)$/i],
  [/(^|\.)(x\.com|twitter\.com)$/i, /^[st]$/],
  [/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/i, /^si$/],
];

/** A link without the parameters that tell its site who shared it, so whoever opens it isn't tied to the sender. */
export function cleanLink(link: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  const params = TRACKING.filter(([host]) => host.test(url.hostname)).map(([, param]) => param);
  const drop = [...url.searchParams.keys()].filter((key) => params.some((param) => param.test(key)));
  if (!drop.length) return link;
  for (const key of drop) url.searchParams.delete(key);
  return url.toString();
}

const SHARE_LINK =
  /^https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/|(?:www\.|m\.)?tiktok\.com\/t\/|(?:www\.|m\.)?(?:instagram|facebook)\.com\/share\/)/i;

/** A short link whose code itself says who shared it, so only following it to the page it leads to can clean it. */
export const isShareLink = (link: string) => SHARE_LINK.test(link);

const href = (link: string) => cleanLink(/^www\./i.test(link) ? `https://${link}` : link);

/**
 * Cleans every link in a message with cleanLink, and swaps share links for the page they lead to, as `resolve` says
 * (null keeps the link as it is). Formatting around and after a link moves with it.
 */
export async function cleanLinksIn(
  text: string,
  entities: MessageEntity[],
  resolve: (link: string) => Promise<string | null>,
): Promise<{ text: string; entities: MessageEntity[] }> {
  let out = text;
  let spans = entities;
  for (const m of [...text.matchAll(LINK)].reverse()) {
    const full = /^www\./i.test(m[0]) ? `https://${m[0]}` : m[0];
    const resolved = isShareLink(full) ? await resolve(full).catch(() => null) : null;
    const cleaned = cleanLink(resolved ?? full);
    if (cleaned === full) continue;
    const next = full === m[0] || resolved ? cleaned : cleaned.replace(/^https:\/\//, "");
    const start = m.index;
    const end = start + m[0].length;
    const at = (p: number) => (p <= start ? p : p >= end ? p + next.length - m[0].length : start + Math.min(p - start, next.length));
    out = out.slice(0, start) + next + out.slice(end);
    spans = spans
      .map((e) => ({ ...e, offset: at(e.offset), length: at(e.offset + e.length) - at(e.offset) }))
      .filter((e) => e.length > 0);
  }
  return { text: out, entities: spans };
}

/** Cuts text into plain runs and links (http(s) URLs or bare www. hosts), in order. */
export function splitLinks(text: string): { text: string; href: string | null }[] {
  const parts: { text: string; href: string | null }[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), href: null });
    parts.push({ text: m[0], href: href(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), href: null });
  return parts;
}

/** The links outside code and spoilers, in order: what a chat's shared links list shows. */
export function messageLinks(text: string, entities: MessageEntity[] = []) {
  const hidden = entities.filter((e) => e.type === "code" || e.type === "spoiler");
  return [...text.matchAll(LINK)]
    .filter((m) => !hidden.some((e) => e.offset < m.index + m[0].length && m.index < e.offset + e.length))
    .map((m) => ({ text: m[0], href: href(m[0]) }));
}

/** The first link outside code and spoilers: the one a message shows a preview card for. */
export const previewLink = (text: string, entities: MessageEntity[] = []) => messageLinks(text, entities)[0]?.href ?? null;

export const PlaceNameQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  locale: z.enum(LOCALES).default("en"),
});
export type PlaceNameQuery = z.infer<typeof PlaceNameQuery>;

export const PlaceNameDTO = z.object({
  name: z.string().nullable().describe("The neighbourhood and town, like Analakely, Antananarivo; null when nothing is known there"),
});
export type PlaceNameDTO = z.infer<typeof PlaceNameDTO>;

const PlaceSession = z
  .string()
  .regex(/^[\w-]{8,36}$/)
  .describe("Made up by the app for one search: the suggestions while typing and the place picked share it");

export const PlaceSuggestQuery = z.object({
  q: z.string().trim().min(2).max(120),
  session: PlaceSession,
  lat: z.coerce.number().min(-90).max(90).optional().describe("Favour places near here"),
  lng: z.coerce.number().min(-180).max(180).optional(),
  locale: z.enum(LOCALES).default("en"),
});
export type PlaceSuggestQuery = z.infer<typeof PlaceSuggestQuery>;

export const PlaceSuggestionDTO = z.object({
  id: z.string().describe("Pass to GET /v1/place-details to learn where it is"),
  name: z.string(),
  address: z.string().nullable(),
});
export type PlaceSuggestionDTO = z.infer<typeof PlaceSuggestionDTO>;

export const PlaceSuggestDTO = z.object({
  suggestions: z.array(PlaceSuggestionDTO),
  left: z.number().int().describe("Searches you have left this month, this one counted"),
});
export type PlaceSuggestDTO = z.infer<typeof PlaceSuggestDTO>;

export const PlaceDetailsQuery = z.object({
  id: z.string().min(1).max(300),
  session: PlaceSession,
  locale: z.enum(LOCALES).default("en"),
});
export type PlaceDetailsQuery = z.infer<typeof PlaceDetailsQuery>;

export const PlaceDetailsDTO = z.object({ lat: z.number(), lng: z.number() });
export type PlaceDetailsDTO = z.infer<typeof PlaceDetailsDTO>;

export const MapPreviewQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  locale: z.enum(LOCALES).default("en"),
});
export type MapPreviewQuery = z.infer<typeof MapPreviewQuery>;

export const MapPickerQuery = z.object({ session: PlaceSession });
export const MapAllowanceDTO = z.object({ left: z.number().int().describe("How many more you may have this month") });
export type MapAllowanceDTO = z.infer<typeof MapAllowanceDTO>;
