import type { MessageEntity } from "@six/shared";

/**
 * Turns `||hidden||` markers into plain text plus spoiler ranges, then trims the text and shifts
 * the ranges to match, since the API stores trimmed text. Unclosed or empty markers stay literal.
 */
export function parseSpoilers(raw: string): { text: string; entities: MessageEntity[] } {
  let text = "";
  const ranges: MessageEntity[] = [];
  let i = 0;
  for (;;) {
    const open = raw.indexOf("||", i);
    const close = open < 0 ? -1 : raw.indexOf("||", open + 2);
    if (close < 0) break;
    const inner = raw.slice(open + 2, close);
    if (!inner.trim()) {
      text += raw.slice(i, close + 2);
    } else {
      text += raw.slice(i, open);
      ranges.push({ type: "spoiler", offset: text.length, length: inner.length });
      text += inner;
    }
    i = close + 2;
  }
  text += raw.slice(i);

  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const entities = ranges
    .map((r) => {
      const start = Math.max(r.offset - lead, 0);
      const end = Math.min(r.offset + r.length - lead, trimmed.length);
      return { type: "spoiler" as const, offset: start, length: end - start };
    })
    .filter((r) => r.length > 0);
  return { text: trimmed, entities };
}

export function toSpoilerMarkup(text: string, entities: MessageEntity[]) {
  let out = "";
  let cursor = 0;
  for (const e of entities) {
    out += `${text.slice(cursor, e.offset)}||${text.slice(e.offset, e.offset + e.length)}||`;
    cursor = e.offset + e.length;
  }
  return out + text.slice(cursor);
}
