"use client";

import { LOCALE_COOKIE, type Locale, dict } from "@six/shared";
import { createContext, useContext, useState } from "react";

let current: Locale = "en";

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: "en",
  setLocale: () => {},
});

/** Holds the language picked on the server from the cookie or Accept-Language, and remembers changes. */
export function LocaleProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const [locale, set] = useState(initial);
  if (typeof window !== "undefined") current = locale;

  function setLocale(l: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    current = l;
    set(l);
  }

  return <LocaleContext value={{ locale, setLocale }}>{children}</LocaleContext>;
}

export const useLocale = () => useContext(LocaleContext);

export const useT = () => dict[useContext(LocaleContext).locale];

/** The strings for code outside React, such as formatters and notifications. Browser only. */
export const getT = () => dict[current];

export const getLocale = () => current;
