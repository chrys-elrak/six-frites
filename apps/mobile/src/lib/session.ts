import type { UserDTO } from "@six/shared";
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
}

let bootstrapped: Promise<void> | null = null;

export const useSession = create<SessionState>((set) => {
  six.auth.onChange((auth) => {
    if (auth) set({ status: "authed", user: auth.user });
    else set({ status: "anon", user: null });
  });

  return {
    status: "loading",
    user: null,
    setUser: (user) => set({ user }),
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
