import { type EntityType, type MessageEntity, TEXT_FONTS, mixColor, textColor, textSize } from "@six/shared";

type Valued = "color" | "font" | "size" | "highlight" | "outline";
type Plain = Exclude<EntityType, Valued>;

export const MARKERS: Record<Plain, string> = {
  bold: "**",
  italic: "__",
  underline: "++",
  strike: "~~",
  spoiler: "||",
  code: "`",
};

const PAIRED: [string, Plain][] = [
  ["**", "bold"],
  ["__", "italic"],
  ["++", "underline"],
  ["~~", "strike"],
  ["||", "spoiler"],
];

/**
 * What `{key:` opens: a colour, gradient, font or size, a background behind the text as `bg-` and a colour, an outline
 * around it as `line-` and a colour, or nothing when the key isn't one.
 */
function styleKey(key: string): { type: Valued; value: string } | null {
  const value = key.toLowerCase();
  const [, kind, rest] = /^(bg-|line-)?(.*)$/.exec(value)!;
  if (kind) return textColor(rest) ? { type: kind === "bg-" ? "highlight" : "outline", value: rest! } : null;
  if (textColor(value)) return { type: "color", value };
  if ((TEXT_FONTS as readonly string[]).includes(value)) return { type: "font", value };
  if (textSize(value) !== null) return { type: "size", value };
  return null;
}

/** The markers around a range: `**` for bold, or `{red:` and `}` for a colour, font or size. */
export function markersOf(e: Pick<MessageEntity, "type" | "value">): [string, string] {
  if (e.type === "highlight") return [`{bg-${e.value}:`, "}"];
  if (e.type === "outline") return [`{line-${e.value}:`, "}"];
  if (e.type === "color" || e.type === "font" || e.type === "size") return [`{${e.value}:`, "}"];
  const m = MARKERS[e.type];
  return [m, m];
}

/**
 * Turns Telegram-style markers (**bold**, __italic__, ++underline++, ~~strike~~, `code`, ||spoiler||) and
 * {red:colour} or {serif:font} into plain text plus entity ranges, then trims the text and shifts the ranges to
 * match, since the API stores trimmed text. A marker only counts when it is closed later on; code content is
 * taken literally.
 */
export function parseMarkup(raw: string): { text: string; entities: MessageEntity[] } {
  const { text, entities } = parseRaw(raw);
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const shifted = entities
    .map((e) => {
      const start = Math.max(e.offset - lead, 0);
      const end = Math.min(e.offset + e.length - lead, trimmed.length);
      return { ...e, offset: start, length: end - start };
    })
    .filter((e) => e.length > 0 && trimmed.slice(e.offset, e.offset + e.length).trim().length > 0);
  return { text: trimmed, entities: shifted };
}

/** parseMarkup without the trimming, for the composer, where a trailing space is still being typed. */
export function parseRaw(raw: string): { text: string; entities: MessageEntity[] } {
  let text = "";
  const entities: MessageEntity[] = [];
  const open = new Map<Plain, number>();
  const braces: { type: Valued; value: string; start: number }[] = [];
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
    if (raw[i] === "{") {
      const head = /^\{((?:bg-|line-)?(?:[a-z0-9]+|#[0-9a-fA-F]{6}(?:-#[0-9a-fA-F]{6})?)):/.exec(raw.slice(i, i + 26));
      const style = head && styleKey(head[1]!);
      if (style && raw.indexOf("}", i + head[0].length) > i + head[0].length) {
        braces.push({ ...style, start: text.length });
        i += head[0].length;
        continue;
      }
    }
    if (raw[i] === "}" && braces.length) {
      const b = braces.pop()!;
      if (text.length > b.start) entities.push({ type: b.type, value: b.value, offset: b.start, length: text.length - b.start });
      i += 1;
      continue;
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

  return { text, entities: tidy(entities) };
}

/** Drops empty ranges and later ones overlapping an earlier range of the same type, sorted by where they start. */
function tidy(entities: MessageEntity[]) {
  return entities
    .filter((e) => e.length > 0)
    .filter((e, k, all) => all.findIndex((o) => o.type === e.type && o.offset < e.offset + e.length && e.offset < o.offset + o.length) === k)
    .sort((a, b) => a.offset - b.offset || b.length - a.length);
}

/** The inverse of parseMarkup, used to put a message back in the composer for editing. */
export const toMarkup = (text: string, entities: MessageEntity[]) => markupMap(text, entities).markup;

/**
 * The markup for text and ranges, with where each character of the text lands in it: `at[i]` is character i's
 * place, after any markers in front of it, and `at[text.length]` is the end.
 */
export function markupMap(text: string, entities: MessageEntity[]) {
  const codes = entities.filter((e) => e.type === "code");
  const inCode = (x: number) => codes.some((c) => c.offset < x && x < c.offset + c.length);
  const isCode = (e: MessageEntity) => (e.type === "code" ? 1 : 0);
  const opens = new Map<number, MessageEntity[]>();
  const closes = new Map<number, MessageEntity[]>();
  for (const e of entities) {
    if (e.type !== "code" && (inCode(e.offset) || inCode(e.offset + e.length))) continue;
    opens.set(e.offset, [...(opens.get(e.offset) ?? []), e]);
    closes.set(e.offset + e.length, [...(closes.get(e.offset + e.length) ?? []), e]);
  }
  let markup = "";
  const at: number[] = [];
  for (let i = 0; i <= text.length; i++) {
    const closing = [...(closes.get(i) ?? [])].reverse();
    for (const e of closing.sort((a, b) => b.offset - a.offset || a.length - b.length || isCode(b) - isCode(a))) {
      markup += markersOf(e)[1];
    }
    if (i === text.length) at.push(markup.length);
    for (const e of (opens.get(i) ?? []).sort((a, b) => b.length - a.length || isCode(a) - isCode(b))) markup += markersOf(e)[0];
    if (i < text.length) {
      at.push(markup.length);
      markup += text[i];
    }
  }
  return { markup, at };
}

/** The place in the text for a place in its markup: the last character that starts at or before it. */
export function plainAt(at: number[], m: number) {
  let i = 0;
  while (i + 1 < at.length && at[i + 1]! <= m) i++;
  return m > at[i]! && i < at.length - 1 ? i + 1 : i;
}

/**
 * Moves the ranges along with an edit that turned `before` into `after`: text typed at the end of a range
 * carries its style on until a space is typed there, text typed at its start doesn't, and deleted text takes its share
 * of each range with it.
 */
export function applyEdit(before: string, after: string, entities: MessageEntity[]): MessageEntity[] {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const removed = before.length - p - s;
  const added = after.length - p - s;
  const spaced = removed === 0 && /^\s/.test(after.slice(p, p + added));
  const move = (x: number, end: boolean) => {
    if (x < p || (x === p && (removed > 0 || (end && spaced)))) return x;
    if (x < p + removed) return p + (end ? added : 0);
    return x - removed + added;
  };
  return tidy(
    entities.map((e) => {
      const start = move(e.offset, false);
      return { ...e, offset: start, length: move(e.offset + e.length, true) - start };
    }),
  );
}

/**
 * Turns a style on over [start, end), or off when all of it already has it. A colour or font replaces another
 * one there, and turns off only when it's the same.
 */
export function toggleFormat(entities: MessageEntity[], start: number, end: number, type: EntityType, value?: string): MessageEntity[] {
  const same = entities.filter((e) => e.type === type);
  const covered = (x: number) => same.some((e) => (value === undefined || e.value === value) && e.offset <= x && x < e.offset + e.length);
  const on = Array.from({ length: end - start }, (_, k) => start + k).every(covered);
  const cut = same.flatMap((e) => {
    const a = e.offset;
    const b = e.offset + e.length;
    if (b <= start || a >= end) return [e];
    return [
      ...(a < start ? [{ ...e, length: start - a }] : []),
      ...(b > end ? [{ ...e, offset: end, length: b - end }] : []),
    ];
  });
  const added = on ? [] : [{ type, offset: start, length: end - start, ...(value !== undefined && { value }) }];
  const merged = [...cut, ...added]
    .sort((a, b) => a.offset - b.offset)
    .reduce<MessageEntity[]>((acc, e) => {
      const last = acc.at(-1);
      if (last && last.value === e.value && last.offset + last.length >= e.offset) {
        last.length = Math.max(last.offset + last.length, e.offset + e.length) - last.offset;
      } else acc.push({ ...e });
      return acc;
    }, []);
  return tidy([...entities.filter((e) => e.type !== type), ...merged]);
}

export interface Segment {
  text: string;
  styles: Set<EntityType>;
  color?: string;
  font?: string;
  size?: string;
  /** A colour behind the text, and one around its letters, as colour range values. */
  highlight?: string;
  outline?: string;
  /** Where this piece starts in the text, and the whole colour range around it, for drawing gradients. */
  offset: number;
  colorRange?: { offset: number; length: number };
}

/** Splits text at every range boundary so each piece carries the styles covering it, with its colour and font. */
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
    const covering = entities.filter((e) => e.offset <= from && e.offset + e.length >= to);
    const color = covering.find((e) => e.type === "color");
    out.push({
      text: text.slice(from, to),
      styles: new Set(covering.map((e) => e.type)),
      color: color?.value,
      font: covering.find((e) => e.type === "font")?.value,
      size: covering.find((e) => e.type === "size")?.value,
      highlight: covering.find((e) => e.type === "highlight")?.value,
      outline: covering.find((e) => e.type === "outline")?.value,
      offset: from,
      colorRange: color && { offset: color.offset, length: color.length },
    });
  }
  return out;
}

/**
 * A piece of text split letter by letter along its gradient, each with its colour, for places that can't fill text
 * with a gradient; one piece with no colour change when it isn't a gradient.
 */
export function gradientLetters(seg: Segment): { text: string; color?: string }[] {
  const paint = textColor(seg.color);
  if (!paint || !("gradient" in paint) || !seg.colorRange) return [{ text: seg.text }];
  const { offset, length } = seg.colorRange;
  return Array.from(seg.text).reduce<{ text: string; color: string }[]>((out, ch) => {
    const at = seg.offset + out.reduce((n, p) => n + p.text.length, 0);
    out.push({ text: ch, color: mixColor(paint.gradient, length > 1 ? (at - offset) / (length - 1) : 0) });
    return out;
  }, []);
}
