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
