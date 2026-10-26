import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";

const AWAY_MS = 5 * 60_000;

/**
 * Whether the lock screen is up, for accounts with an app lock. A resumed session starts locked (signing in
 * counts as unlocking), and the app locks again once it has been in the background for AWAY_MS.
 */
export const useAppLock = create<{ locked: boolean }>(() => ({ locked: true }));

export const unlock = () => useAppLock.setState({ locked: false });

export function useAutoLock() {
  useEffect(() => {
    let awayAt = 0;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") awayAt = Date.now();
      else if (state === "active" && awayAt && Date.now() - awayAt > AWAY_MS) useAppLock.setState({ locked: true });
    });
    return () => sub.remove();
  }, []);
}
