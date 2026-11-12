"use client";

import { fromB64, sealToLinkKey, utf8 } from "@six/crypto";
import { useEffect, useState } from "react";
import { type Provider, firebaseConfig, firebaseProvider } from "@/components/sign-in-buttons";
import { useT } from "@/lib/i18n";

const BACK = "sixfrites://auth";
const KEY = "six-app-sign-in";

/**
 * Apple or Facebook sign-in for the phone app, run in its browser tab, then handed back through sixfrites://auth. The
 * app puts a one-time public key after the #; the Firebase ID token goes back sealed to it, so another app catching
 * the link learns nothing. It redirects rather than opening a popup, which those tabs don't allow, and runs Firebase's
 * handler from this domain (proxied in next.config) so the redirect still works where third-party storage is blocked.
 */
async function signIn(): Promise<string> {
  const provider = new URLSearchParams(location.search).get("provider");
  const fresh = location.hash.slice(1);
  if (fresh) {
    sessionStorage.setItem(KEY, fresh);
    history.replaceState(null, "", location.pathname + location.search);
  }
  const pub = sessionStorage.getItem(KEY);
  if (!pub || (provider !== "apple" && provider !== "facebook")) return `${BACK}?error=INVALID_LOGIN_TOKEN`;

  const { getApps, initializeApp } = await import("firebase/app");
  const { getAuth, getRedirectResult, signInWithRedirect, signOut } = await import("firebase/auth");
  const auth = getAuth(getApps()[0] ?? initializeApp({ ...firebaseConfig, authDomain: location.host }));
  if (fresh) {
    await signInWithRedirect(auth, await firebaseProvider(provider as Provider));
    return new Promise(() => {});
  }
  sessionStorage.removeItem(KEY);
  try {
    const result = await getRedirectResult(auth);
    if (!result) return BACK;
    const idToken = await result.user.getIdToken();
    await signOut(auth);
    return `${BACK}?box=${sealToLinkKey(fromB64(pub), utf8(idToken))}`;
  } catch (err) {
    const taken = (err as { code?: string }).code === "auth/account-exists-with-different-credential";
    return `${BACK}?error=${taken ? "EMAIL_TAKEN" : "INVALID_LOGIN_TOKEN"}`;
  }
}

let started: Promise<string> | null = null;

export default function AppSignIn() {
  const tr = useT();
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    started ??= signIn();
    void started.then((url) => {
      setBack(url);
      location.replace(url);
    });
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      {back ? (
        <a href={back} className="rounded-full bg-brand px-6 py-3 font-semibold text-white">
          {tr.auth.backToApp}
        </a>
      ) : (
        <p className="text-stone-500">{tr.auth.signingIn}</p>
      )}
    </main>
  );
}
