const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

/** The emoji in `text` if it is made of 1 to `max` emoji and nothing else (spaces aside), else null. */
export function emojiOnly(text: string, max = 3): string[] | null {
  if (!segmenter) return null;
  const graphemes = [...segmenter.segment(text.trim())].map((s) => s.segment).filter((g) => g.trim());
  if (!graphemes.length || graphemes.length > max) return null;
  return graphemes.every((g) => EMOJI.test(g)) ? graphemes : null;
}

let animated: Promise<Set<string>> | null = null;

function animatedSet() {
  animated ??= import("./noto-animated.json").then((m) => new Set(m.default as string[]));
  return animated;
}

const toKey = (emoji: string) => [...emoji].map((c) => c.codePointAt(0)!.toString(16)).join("_");

/** The Noto Animated Emoji Lottie URL for this emoji, or null when Google has no animation for it. */
export async function animatedEmojiUrl(emoji: string): Promise<string | null> {
  const set = await animatedSet();
  const key = toKey(emoji);
  const bare = key.replace(/_fe0f/g, "");
  const candidates = [key, bare, bare.replace(/^([0-9a-f]+)/, "$1_fe0f")];
  const hit = candidates.find((k) => set.has(k));
  return hit ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${hit}/lottie.json` : null;
}
