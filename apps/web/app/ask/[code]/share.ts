import { type AskLinkDTO, LOCALE_COOKIE, dict, pickLocale } from "@six/shared";
import { cookies, headers } from "next/headers";

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Whose link `code` is, for its share preview, with the strings in the visitor's language; no profile when the link doesn't work. */
export async function askPreview(code: string) {
  const accepted = (await headers()).get("accept-language")?.split(",").map((tag) => tag.split(";")[0]!.trim()) ?? [];
  const t = dict[pickLocale([(await cookies()).get(LOCALE_COOKIE)?.value, ...accepted])].ask;
  const res = await fetch(`${API_URL}/v1/ask/${encodeURIComponent(code)}`, { next: { revalidate: 300 } }).catch(() => null);
  const profile = res?.ok ? ((await res.json()) as AskLinkDTO) : null;
  return { t, profile };
}
