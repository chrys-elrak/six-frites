import { create } from "zustand";

const KEY = "six:data-saver";

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) return saved === "1";
  } catch {}
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

/**
 * Data saver, for this browser: photos and GIFs wait for a tap instead of downloading on their own, and photos
 * go out smaller. It starts on when the browser asks sites to save data.
 */
export const useDataSaver = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: typeof window !== "undefined" && load(),
  set(on) {
    set({ on });
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {}
  },
}));
