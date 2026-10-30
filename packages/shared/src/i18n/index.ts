import auth from "./auth.js";
import calls from "./calls.js";
import chat from "./chat.js";
import chats from "./chats.js";
import common from "./common.js";
import composer from "./composer.js";
import contacts from "./contacts.js";
import messages from "./messages.js";
import settings from "./settings.js";
import summary from "./summary.js";
import support from "./support.js";
import time from "./time.js";

export const LOCALES = ["en", "fr", "mg"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language's name in that language, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", fr: "Français", mg: "Malagasy" };

/** The web app's cookie holding the chosen language. */
export const LOCALE_COOKIE = "six-locale";

export const isLocale = (x: unknown): x is Locale => LOCALES.includes(x as Locale);

/** The first supported language among BCP 47 tags such as "fr-FR", or English. */
export function pickLocale(tags: Iterable<string | null | undefined>): Locale {
  for (const tag of tags) {
    const base = tag?.split(/[-_]/)[0]?.toLowerCase();
    if (isLocale(base)) return base;
  }
  return "en";
}

const namespaces = { common, time, summary, auth, contacts, chats, chat, composer, messages, calls, settings, support };
type Namespaces = typeof namespaces;

/** Every string the apps show, in one language. Values are strings, or functions for text with parts. */
export type Dict = { [K in keyof Namespaces]: Namespaces[K]["en"] };

const build = (l: Locale) =>
  Object.fromEntries(Object.entries(namespaces).map(([k, ns]) => [k, ns[l]])) as Dict;

export const dict: Record<Locale, Dict> = { en: build("en"), fr: build("fr"), mg: build("mg") };
