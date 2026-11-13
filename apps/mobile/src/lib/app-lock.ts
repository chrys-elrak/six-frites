import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";

const AWAY_MS = 5 * 60_000;
const BIOMETRIC_KEY = "six:app-lock-biometric";

/**
 * Whether the lock screen is up, for accounts with an app lock. A resumed session starts locked (signing in
 * counts as unlocking), and the app locks again once it has been in the background for AWAY_MS.
 */
export const useAppLock = create<{ locked: boolean; archiveOpen: boolean }>(() => ({ locked: true, archiveOpen: false }));

export const unlock = () => useAppLock.setState({ locked: false });

/** The archived chats took the code: chats opened from them don't ask again until the archive is left. */
export const setArchiveOpen = (archiveOpen: boolean) => useAppLock.setState({ archiveOpen });

/** Whether this phone unlocks with a fingerprint. The app lock code keeps working as the fallback. */
export const useBiometricUnlock = create<{ on: boolean }>(() => ({ on: false }));

export function setBiometricUnlock(on: boolean) {
  useBiometricUnlock.setState({ on });
  void AsyncStorage.setItem(BIOMETRIC_KEY, on ? "1" : "").catch(() => null);
}

void AsyncStorage.getItem(BIOMETRIC_KEY)
  .then((saved) => saved && useBiometricUnlock.setState({ on: true }))
  .catch(() => null);

export const canUseBiometrics =() => LocalAuthentication.isEnrolledAsync().catch(() => false);

export async function checkBiometrics(promptMessage: string, cancelLabel: string) {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel, disableDeviceFallback: true }).catch(
    () => null,
  );
  return !!res?.success;
}

export function useAutoLock() {
  useEffect(() => {
    let awayAt = 0;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") awayAt = Date.now();
      else if (state === "active" && awayAt && Date.now() - awayAt > AWAY_MS) useAppLock.setState({ locked: true, archiveOpen: false });
    });
    return () => sub.remove();
  }, []);
}
