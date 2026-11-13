"use client";

import { LOCALES, isLocale } from "@six/shared";
import { Globe } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n";

/** A small language menu for the pages that don't have the app's settings. */
export function LanguageSelect() {
  const tr = useT();
  const { locale, setLocale } = useLocale();
  return (
    <label className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800">
      <Globe className="size-4" />
      <select
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        aria-label={tr.common.language}
        className="cursor-pointer appearance-none bg-transparent outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
