import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Locale, dict, isLocale, pickLocale } from "@six/shared";
import { create } from "zustand";

const KEY = "six:locale";

/** The app's language: the phone's when supported, until the user picks one in settings. */
export const useLocale = create<{ locale: Locale; ready: boolean }>(() => ({
  locale: pickLocale([Intl.DateTimeFormat().resolvedOptions().locale]),
  ready: false,
}));

void AsyncStorage.getItem(KEY)
  .then((saved) => useLocale.setState(isLocale(saved) ? { locale: saved, ready: true } : { ready: true }))
  .catch(() => useLocale.setState({ ready: true }));

export function setLocale(locale: Locale) {
  useLocale.setState({ locale });
  void AsyncStorage.setItem(KEY, locale).catch(() => null);
}

export const useT = () => dict[useLocale((s) => s.locale)];

/** The strings for code outside React, such as formatters and notifications. */
export const getT = () => dict[useLocale.getState().locale];

export const getLocale = () => useLocale.getState().locale;
