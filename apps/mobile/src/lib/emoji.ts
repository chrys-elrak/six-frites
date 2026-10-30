import animated from "./noto-animated.json";

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function compile(source: string) {
  try {
    return new RegExp(source, "gu");
  } catch {
    return null;
  }
}

const EMOJI = compile("^(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})");
const SEQUENCE =
  "\\p{Regional_Indicator}{2}|\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?(?:\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*";
const CLUSTER = compile(`${SEQUENCE}|\\S`);
const SPLIT = compile(`(${SEQUENCE})`);

/** `text` cut around each emoji: plain text at even indexes, one emoji at each odd one. */
export function splitEmoji(text: string): string[] {
  return SPLIT ? text.split(SPLIT) : [text];
}

function graphemes(text: string) {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment).filter((g) => g.trim());
  return CLUSTER ? (text.match(CLUSTER) ?? []) : null;
}

/** The emoji in `text` if it is made of 1 to `max` emoji and nothing else (spaces aside), else null. */
export function emojiOnly(text: string, max = 3): string[] | null {
  if (!EMOJI) return null;
  const parts = graphemes(text.trim());
  if (!parts?.length || parts.length > max) return null;
  return parts.every((g) => {
    EMOJI.lastIndex = 0;
    return EMOJI.test(g);
  })
    ? parts
    : null;
}

const known = new Set(animated as string[]);
const toKey = (emoji: string) => [...emoji].map((c) => c.codePointAt(0)!.toString(16)).join("_");

/** The Noto Animated Emoji Lottie URL for this emoji, or null when Google has no animation for it. */
export function animatedEmojiUrl(emoji: string): string | null {
  const key = toKey(emoji);
  const bare = key.replace(/_fe0f/g, "");
  const hit = [key, bare, bare.replace(/^([0-9a-f]+)/, "$1_fe0f")].find((k) => known.has(k));
  return hit ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${hit}/lottie.json` : null;
}
