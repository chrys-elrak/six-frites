import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BOT_WORDS, type Locale, WORDS_MIN, hangmanWord } from "@six/shared";

const require = createRequire(import.meta.url);

const sources: Record<Locale, () => string[]> = {
  en: () => require("an-array-of-english-words"),
  fr: () => require("an-array-of-french-words"),
  mg: () => readFileSync(new URL("../../data/words-mg.txt", import.meta.url), "utf8").split("\n"),
};

const cache = new Map<Locale, string[]>();

/**
 * The words word hunt accepts in a language, in capitals without accents, loaded on first use. Words
 * with a capital, hyphen or apostrophe are names or compounds and are left out.
 */
export function lexicon(locale: Locale) {
  let words = cache.get(locale);
  if (!words) {
    const plain = [...sources[locale](), ...BOT_WORDS[locale]].filter((w) => /^\p{Ll}+$/u.test(w)).map(hangmanWord);
    words = [...new Set(plain.filter((w) => w.length >= WORDS_MIN))];
    cache.set(locale, words);
  }
  return words;
}
