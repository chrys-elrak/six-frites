import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export const RATES = [1, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

const KEY = "six:playback-rate";

interface PlaybackState {
  rate: Rate;
  next: () => void;
}

/** Playback speed for voice and video messages, remembered on this device. */
export const usePlaybackRate = create<PlaybackState>((set, get) => ({
  rate: 1,
  next() {
    const rate = RATES[(RATES.indexOf(get().rate) + 1) % RATES.length]!;
    void AsyncStorage.setItem(KEY, String(rate)).catch(() => null);
    set({ rate });
  },
}));

void AsyncStorage.getItem(KEY)
  .then((saved) => {
    const rate = Number(saved);
    if ((RATES as readonly number[]).includes(rate)) usePlaybackRate.setState({ rate: rate as Rate });
  })
  .catch(() => null);
