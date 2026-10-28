const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Where `query` first appears in `text`, ignoring case and accents ("ete" finds "Été"), cut to a
 * snippet with some words around it: what a search result shows. Null when it isn't there.
 */
export function findInText(text: string, query: string, around = 40) {
  const needle = fold(query.trim());
  if (!needle) return null;
  const chars = [...text];
  const folded = chars.map(fold);
  const at = folded.join("").indexOf(needle);
  if (at < 0) return null;
  let start = -1;
  let end = chars.length;
  for (let i = 0, pos = 0; i < chars.length; pos += folded[i]!.length, i++) {
    if (start < 0 && pos + folded[i]!.length > at) start = i;
    if (pos + folded[i]!.length >= at + needle.length) {
      end = i + 1;
      break;
    }
  }
  while (end < chars.length && !folded[end]) end++;
  const from = Math.max(0, start - around);
  const to = Math.min(chars.length, end + around * 2);
  return {
    before: (from > 0 ? "…" : "") + chars.slice(from, start).join(""),
    match: chars.slice(start, end).join(""),
    after: chars.slice(end, to).join("") + (to < chars.length ? "…" : ""),
  };
}
