"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: "popup" }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  const render = useCallback(() => {
    const gsi = window.google?.accounts.id;
    if (!gsi || !ref.current || !CLIENT_ID) return;
    gsi.initialize({ client_id: CLIENT_ID, callback: (r) => callback.current(r.credential), ux_mode: "popup" });
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
