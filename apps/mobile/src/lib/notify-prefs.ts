import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Tone } from "@six/shared";
import { create } from "zustand";

const PREFS_KEY = "six:notifications";

export interface NotifyPrefs {
  sound: boolean;
  popups: boolean;
  tone: Tone;
}

/** Notification settings for this device. */
export const useNotifyPrefs = create<NotifyPrefs & { set: (patch: Partial<NotifyPrefs>) => void }>((set, get) => ({
  sound: true,
  popups: true,
  tone: "frites",
  set(patch) {
    set(patch);
    const { sound, popups, tone } = get();
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ sound, popups, tone })).catch(() => null);
  },
}));

void AsyncStorage.getItem(PREFS_KEY)
  .then((saved) => saved && useNotifyPrefs.setState(JSON.parse(saved) as Partial<NotifyPrefs>))
  .catch(() => null);
