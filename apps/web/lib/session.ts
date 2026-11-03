import { type UserDTO, isLimited } from "@six/shared";
import { create } from "zustand";
import { startE2EE } from "./e2ee";
import { getT } from "./i18n";
import { SIGNED_IN_COOKIE } from "./site";
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
      if (!isLimited(auth.user)) startE2EE(auth.user.id);
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
          if (user && !isLimited(user)) startE2EE(user.id);
          set(user ? { status: "authed", user } : { status: "anon", user: null });
        })
        .catch(() => set({ status: "anon", user: null }));
      return bootstrapped;
    },
  };
});

useSession.subscribe(({ status }) => {
  if (status === "loading") return;
  document.cookie = `${SIGNED_IN_COOKIE}=1; path=/; samesite=lax; max-age=${status === "authed" ? 31_536_000 : 0}`;
});

const DEVICE_KEY = "six:device-id";

/** A random ID kept in this browser, so bans and anonymous blocks reach other accounts signed in here. */
export function deviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return undefined;
  }
}

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
