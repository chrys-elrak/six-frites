import { z } from "zod";
import type { MessageEntity } from "./chats.js";

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

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>"'.,;:!?)\]}]/gi;

const href = (link: string) => (/^www\./i.test(link) ? `https://${link}` : link);

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

/** The first link outside code and spoilers: the one a message shows a preview card for. */
export function previewLink(text: string, entities: MessageEntity[] = []) {
  const hidden = entities.filter((e) => e.type === "code" || e.type === "spoiler");
  for (const m of text.matchAll(LINK)) {
    const end = m.index + m[0].length;
    if (!hidden.some((e) => e.offset < end && m.index < e.offset + e.length)) return href(m[0]);
  }
  return null;
}
