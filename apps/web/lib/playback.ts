import { create } from "zustand";

export const RATES = [1, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

const KEY = "six:playback-rate";

function load(): Rate {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return (RATES as readonly number[]).includes(saved) ? (saved as Rate) : 1;
  } catch {
    return 1;
  }
}

interface PlaybackState {
  rate: Rate;
  next: () => void;
}

/** Playback speed for voice and video messages, remembered on this device. */
export const usePlaybackRate = create<PlaybackState>((set, get) => ({
  rate: typeof window === "undefined" ? 1 : load(),
  next() {
    const rate = RATES[(RATES.indexOf(get().rate) + 1) % RATES.length]!;
    try {
      localStorage.setItem(KEY, String(rate));
    } catch {}
    set({ rate });
  },
}));
