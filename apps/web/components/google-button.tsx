"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

interface GoogleId {
  initialize(opts: {
    client_id: string;
    callback?: (r: { credential: string }) => void;
    ux_mode?: "popup" | "redirect";
    login_uri?: string;
    nonce?: string;
  }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const KEY = "google-signin";

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function startRedirect() {
  if (!isIos()) return undefined;
  try {
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(KEY, JSON.stringify({ nonce, back: location.pathname + location.search }));
    return nonce;
  } catch {
    return undefined;
  }
}

function takeRedirected() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (!saved?.credential) return undefined;
    sessionStorage.removeItem(KEY);
    const payload = JSON.parse(atob(saved.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return saved.nonce && payload.nonce === saved.nonce ? (saved.credential as string) : undefined;
  } catch {
    return undefined;
  }
}

export function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    const credential = takeRedirected();
    if (credential) callback.current(credential);
  }, []);

  const render = useCallback(() => {
    const gsi = window.google?.accounts.id;
    if (!gsi || !ref.current || !CLIENT_ID) return;
    const nonce = startRedirect();
    gsi.initialize(
      nonce
        ? { client_id: CLIENT_ID, ux_mode: "redirect", login_uri: `${location.origin}/auth/google`, nonce }
        : { client_id: CLIENT_ID, callback: (r) => callback.current(r.credential), ux_mode: "popup" },
    );
    gsi.renderButton(ref.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: Math.min(ref.current.offsetWidth || 320, 400),
    });
  }, []);

  useEffect(() => {
    if (ready) render();
  }, [ready, render]);

  if (!CLIENT_ID) {
    return (
      <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code>apps/web/.env.local</code> to enable sign-in.
      </p>
    );
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={ref} className="flex min-h-11 w-full justify-center" />
    </>
  );
}
