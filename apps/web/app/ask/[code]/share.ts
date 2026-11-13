import type { AskLinkDTO } from "@six/shared";
import { previewDict, previewOf } from "@/lib/link-preview";

/** Whose link `code` is, for its share preview, with the strings in the visitor's language; no profile when the link doesn't work. */
export async function askPreview(code: string) {
  const [t, profile] = await Promise.all([previewDict(), previewOf<AskLinkDTO>(`ask/${encodeURIComponent(code)}`)]);
  return { t: t.ask, profile };
}
