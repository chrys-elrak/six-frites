import { useEffect } from "react";
import { create } from "zustand";

const AWAY_MS = 5 * 60_000;

/**
 * Whether the lock screen is up, for accounts with an app lock. A resumed session starts locked (signing in
 * counts as unlocking), and the app locks again once the tab has been hidden for AWAY_MS. The archived chats
 * take the code again each time they're opened from the chat list.
 */
export const useAppLock = create<{ locked: boolean; archiveOpen: boolean }>(() => ({
  locked: true,
  archiveOpen: false,
}));

export const unlock = () => useAppLock.setState({ locked: false });

export const setArchiveOpen = (archiveOpen: boolean) => useAppLock.setState({ archiveOpen });

export function useAutoLock() {
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) useAppLock.setState({ locked: true });
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
