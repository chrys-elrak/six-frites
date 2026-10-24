import type { EntityType, MessageEntity } from "@six/shared";

export const MARKERS: Record<EntityType, string> = {
  bold: "**",
  italic: "__",
  strike: "~~",
  spoiler: "||",
  code: "`",
};

const PAIRED: [string, EntityType][] = [
  ["**", "bold"],
  ["__", "italic"],
  ["~~", "strike"],
  ["||", "spoiler"],
];

/**
 * Turns Telegram-style markers (**bold**, __italic__, ~~strike~~, `code`, ||spoiler||) into plain
 * text plus entity ranges, then trims the text and shifts the ranges to match, since the API stores
 * trimmed text. A marker only counts when it is closed later on; code content is taken literally.
 */
export function parseMarkup(raw: string): { text: string; entities: MessageEntity[] } {
  let text = "";
  const entities: MessageEntity[] = [];
  const open = new Map<EntityType, number>();
  let i = 0;

  outer: while (i < raw.length) {
    if (raw[i] === "`") {
      const close = raw.indexOf("`", i + 1);
      if (close > i + 1) {
        entities.push({ type: "code", offset: text.length, length: close - i - 1 });
        text += raw.slice(i + 1, close);
        i = close + 1;
        continue;
      }
    }
    for (const [marker, type] of PAIRED) {
      if (!raw.startsWith(marker, i)) continue;
      const start = open.get(type);
      if (start !== undefined) {
        open.delete(type);
        if (text.length > start) entities.push({ type, offset: start, length: text.length - start });
        i += marker.length;
        continue outer;
      }
      if (raw.indexOf(marker, i + marker.length) > i + marker.length) {
        open.set(type, text.length);
        i += marker.length;
        continue outer;
      }
    }
    text += raw[i];
    i += 1;
  }

  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const shifted = entities
    .map((e) => {
      const start = Math.max(e.offset - lead, 0);
      const end = Math.min(e.offset + e.length - lead, trimmed.length);
      return { type: e.type, offset: start, length: end - start };
    })
    .filter((e) => e.length > 0 && trimmed.slice(e.offset, e.offset + e.length).trim().length > 0)
    .sort((a, b) => a.offset - b.offset || b.length - a.length);
  return { text: trimmed, entities: shifted };
}

/** The inverse of parseMarkup, used to put a message back in the composer for editing. */
export function toMarkup(text: string, entities: MessageEntity[]) {
  const opens = new Map<number, MessageEntity[]>();
  const closes = new Map<number, MessageEntity[]>();
  for (const e of entities) {
    opens.set(e.offset, [...(opens.get(e.offset) ?? []), e]);
    closes.set(e.offset + e.length, [...(closes.get(e.offset + e.length) ?? []), e]);
  }
  let out = "";
  for (let i = 0; i <= text.length; i++) {
    for (const e of (closes.get(i) ?? []).sort((a, b) => b.offset - a.offset)) out += MARKERS[e.type];
    for (const e of (opens.get(i) ?? []).sort((a, b) => b.length - a.length)) out += MARKERS[e.type];
    if (i < text.length) out += text[i];
  }
  return out;
}

export interface Segment {
  text: string;
  styles: Set<EntityType>;
}

/** Splits text at every range boundary so each piece carries the set of styles covering it. */
export function segments(text: string, entities: MessageEntity[]): Segment[] {
  const cuts = new Set([0, text.length]);
  for (const e of entities) {
    cuts.add(e.offset);
    cuts.add(e.offset + e.length);
  }
  const points = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [from, to] = [points[k]!, points[k + 1]!];
    if (to <= from) continue;
    const styles = new Set(entities.filter((e) => e.offset <= from && e.offset + e.length >= to).map((e) => e.type));
    out.push({ text: text.slice(from, to), styles });
  }
  return out;
}
