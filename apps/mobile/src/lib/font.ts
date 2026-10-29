import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const KEY = "six:plain-font";

/** Draws text in the bundled Inter instead of the phone's font, for phones set to a decorative font. */
export const usePlainFont = create<{ on: boolean }>(() => ({ on: false }));

void AsyncStorage.getItem(KEY)
  .then((saved) => usePlainFont.setState({ on: saved === "1" }))
  .catch(() => null);

export function setPlainFont(on: boolean) {
  usePlainFont.setState({ on });
  void AsyncStorage.setItem(KEY, on ? "1" : "0").catch(() => null);
}
