import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const KEY = "six:plain-font";

/**
 * Draws text in the bundled Inter instead of the phone's font, unless the user picks theirs: React Native measures text
 * in the stock font, so a phone font that draws bigger gets cut off at the edges of bubbles.
 */
export const usePlainFont = create<{ on: boolean }>(() => ({ on: true }));

void AsyncStorage.getItem(KEY)
  .then((saved) => usePlainFont.setState({ on: saved !== "0" }))
  .catch(() => null);

export function setPlainFont(on: boolean) {
  usePlainFont.setState({ on });
  void AsyncStorage.setItem(KEY, on ? "1" : "0").catch(() => null);
}
