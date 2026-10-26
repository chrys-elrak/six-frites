import type { UserDTO } from "@six/shared";
import { create } from "zustand";
import { startE2EE } from "./e2ee";
import { getT } from "./i18n";
import { six } from "./six";

type Status = "loading" | "authed" | "anon";

interface SessionState {
  status: Status;
  user: UserDTO | null;
  bootstrap: () => Promise<void>;
  setUser: (user: UserDTO) => void;
}

let bootstrapped: Promise<void> | null = null;

export const useSession = create<SessionState>((set) => {
  six.auth.onChange((auth) => {
    if (auth) {
      startE2EE(auth.user.id);
      set({ status: "authed", user: auth.user });
    }
    else set({ status: "anon", user: null });
  });

  return {
    status: "loading",
    user: null,
    setUser: (user) => set({ user }),
    bootstrap() {
      bootstrapped ??= six.auth
        .resume()
        .then((user) => {
          if (user) startE2EE(user.id);
          set(user ? { status: "authed", user } : { status: "anon", user: null });
        })
        .catch(() => set({ status: "anon", user: null }));
      return bootstrapped;
    },
  };
});

export function deviceName() {
  if (typeof navigator === "undefined") return undefined;
  const tr = getT();
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : tr.auth.browser;
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : tr.auth.unknownOs;
  return tr.auth.deviceName(browser, os);
}
