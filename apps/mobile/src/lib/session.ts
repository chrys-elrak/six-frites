import { b64, randomBytes } from "@six/crypto";
import type { UserDTO } from "@six/shared";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { GoogleOneTapSignIn } from "react-native-nitro-google-signin";
import { create } from "zustand";
import { forgetE2EE } from "./e2ee";
import { six } from "./six";

type Status = "loading" | "authed" | "anon" | "unreachable";

interface SessionState {
  status: Status;
  user: UserDTO | null;
  bootstrap: () => Promise<void>;
  setUser: (user: UserDTO) => void;
  /** Set when this guest was let all the way in while the app was open, for the welcome card. */
  upgraded: boolean;
  clearUpgraded: () => void;
}

let bootstrapped: Promise<void> | null = null;

export const useSession = create<SessionState>((set, get) => {
  six.auth.onChange((auth) => {
    if (auth) set({ status: "authed", user: auth.user });
    else set({ status: "anon", user: null });
  });

  return {
    status: "loading",
    user: null,
    upgraded: false,
    clearUpgraded: () => set({ upgraded: false }),
    setUser: (user) => set({ user, upgraded: get().upgraded || (!!get().user?.guest && !user.guest) }),
    bootstrap() {
      bootstrapped ??= six.auth
        .resume()
        .then((user) => set(user ? { status: "authed", user } : { status: "anon", user: null }))
        .catch(() => {
          bootstrapped = null;
          set({ status: "unreachable", user: null });
        });
      return bootstrapped;
    },
  };
});

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

let googleConfigured = false;

/** Shows Google's account picker and returns an ID token whose audience is the web client the API trusts. */
export async function googleIdToken(): Promise<string | null> {
  if (!googleConfigured) {
    GoogleOneTapSignIn.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleConfigured = true;
  }
  await GoogleOneTapSignIn.checkPlayServices();
  const res = await GoogleOneTapSignIn.presentExplicitSignIn();
  return res.type === "success" && res.data ? res.data.idToken : null;
}

export async function logout() {
  await forgetE2EE();
  await six.auth.logout().catch(() => null);
  await GoogleOneTapSignIn.signOut().catch(() => null);
}

const DEVICE_KEY = "six.device-id";

/** A random ID kept on this phone, so bans and anonymous blocks reach other accounts signed in here. */
export async function deviceId() {
  try {
    const saved = await SecureStore.getItemAsync(DEVICE_KEY);
    if (saved) return saved;
    const fresh = b64(randomBytes(18));
    await SecureStore.setItemAsync(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return undefined;
  }
}

export function deviceName() {
  const c = Platform.constants as { Brand?: string; Model?: string; Manufacturer?: string };
  if (Platform.OS === "android") {
    const maker = c.Manufacturer ?? c.Brand ?? "";
    const model = c.Model ?? "Android";
    const name = model.toLowerCase().startsWith(maker.toLowerCase()) ? model : `${maker} ${model}`.trim();
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  return Platform.OS === "ios" ? "iPhone" : undefined;
}
