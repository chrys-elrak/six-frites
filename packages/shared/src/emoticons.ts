const EMOTICONS = new Map<string, string>([
  ["<3", "❤️"],
  ["</3", "💔"],
  [":)", "🙂"],
  [":-)", "🙂"],
  [":(", "🙁"],
  [":-(", "🙁"],
  [":D", "😄"],
  [":-D", "😄"],
  ["xD", "😆"],
  ["XD", "😆"],
  [":p", "😛"],
  [":P", "😛"],
  [":-p", "😛"],
  [":-P", "😛"],
  [";)", "😉"],
  [";-)", "😉"],
  [":o", "😮"],
  [":O", "😮"],
  [":-o", "😮"],
  [":-O", "😮"],
  [":*", "😘"],
  [":-*", "😘"],
  [":'(", "😢"],
  [":')", "🥲"],
  [":/", "😕"],
  [":-/", "😕"],
  [":|", "😐"],
  [">:(", "😠"],
  ["^^", "😊"],
  ["^_^", "😊"],
  ["-_-", "😑"],
]);

/**
 * Swaps the text emoticon ending at `end`, such as <3, :D or :p, for its emoji. It only counts as
 * a word of its own, and not inside `code`. Returns null when there is nothing to swap.
 */
export function swapEmoticon(text: string, end: number) {
  let start = end;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  const emoji = EMOTICONS.get(text.slice(start, end));
  if (!emoji || text.slice(0, start).split("`").length % 2 === 0) return null;
  return text.slice(0, start) + emoji + text.slice(end);
}

/** After a keystroke, swaps the emoticon the user just ended with a space or new line, and says where the caret goes. */
export function emojifyTyped(prev: string, next: string) {
  if (next.length !== prev.length + 1) return null;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  if (!/\s/.test(next[i]!)) return null;
  const text = swapEmoticon(next, i);
  return text === null ? null : { text, caret: i + 1 + text.length - next.length };
}

/** Swaps an emoticon left at the very end of a message when it is sent. */
export function emojifyEnd(text: string) {
  const trimmed = text.trimEnd();
  return swapEmoticon(trimmed, trimmed.length) ?? text;
}

/** One emoji of `@six/shared/emojis.json`: the emoji, its name and its search keywords. */
export interface EmojiEntry {
  e: string;
  n: string;
  k: string;
}

/** The `:name` typed right before the caret, as in Telegram, once it has 2 letters; null when there is none. */
export function emojiQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const m = /(?:^|\s):([\p{L}\p{N}_+-]{2,})$/u.exec(before);
  if (!m || before.split("`").length % 2 === 0) return null;
  return { start: caret - m[1]!.length - 1, query: m[1]!.toLowerCase() };
}

/** Emoji named exactly `query` (or with it as a whole word) first, then by a word that starts with it, shortest names first. */
export function suggestEmoji(list: EmojiEntry[], query: string, limit = 8) {
  const q = query.replace(/_/g, " ");
  const rank = (x: EmojiEntry) => {
    const words = x.n.split(" ");
    if (x.n === q || words.includes(q)) return 0;
    if (x.n.startsWith(q) || words.some((w) => w.startsWith(q))) return 1;
    return x.k.split(" ").some((w) => w.startsWith(query)) ? 2 : 3;
  };
  return list
    .map((x) => ({ x, r: rank(x) }))
    .filter((s) => s.r < 3)
    .sort((a, b) => a.r - b.r || a.x.n.length - b.x.n.length)
    .slice(0, limit)
    .map((s) => s.x);
}
