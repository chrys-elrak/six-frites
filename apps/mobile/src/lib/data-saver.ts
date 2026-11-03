import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const KEY = "six:data-saver";

/** Data saver, for this phone: only voice messages and video notes download on their own, and photos go out smaller. */
export const useDataSaver = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: false,
  set(on) {
    set({ on });
    void AsyncStorage.setItem(KEY, on ? "1" : "0").catch(() => null);
  },
}));

void AsyncStorage.getItem(KEY)
  .then((saved) => saved !== null && useDataSaver.setState({ on: saved === "1" }))
  .catch(() => null);
