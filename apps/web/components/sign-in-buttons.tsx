"use client";

import { useState } from "react";
import { GoogleButton } from "@/components/google-button";
import { useT } from "@/lib/i18n";

export type SignInVia = "loginWithGoogle" | "loginWithFirebase";
type Provider = "apple" | "facebook";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "akondro.firebaseapp.com",
  projectId: "akondro",
};
const PROVIDERS = (process.env.NEXT_PUBLIC_LOGIN_PROVIDERS ?? "").split(",").filter((p): p is Provider => p === "apple" || p === "facebook");

const MARKS: Record<Provider, string> = {
  apple:
    "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
};

/** Opens Apple's or Facebook's sign-in through Firebase and returns its ID token, or null when they closed it. */
async function firebaseIdToken(provider: Provider) {
  const { getApps, initializeApp } = await import("firebase/app");
  const { FacebookAuthProvider, OAuthProvider, getAuth, signInWithPopup, signOut } = await import("firebase/auth");
  const auth = getAuth(getApps()[0] ?? initializeApp(firebaseConfig));
  const p = provider === "apple" ? new OAuthProvider("apple.com") : new FacebookAuthProvider();
  p.addScope("email");
  if (provider === "apple") p.addScope("name");
  const signed = await signInWithPopup(auth, p).catch((err: { code?: string }) => {
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return null;
    throw err;
  });
  if (!signed) return null;
  const idToken = await signed.user.getIdToken();
  await signOut(auth);
  return idToken;
}

/** Google's own button, then the providers that sign in through Firebase. */
export function SignInButtons({ onCredential }: { onCredential: (idToken: string, via: SignInVia) => void }) {
  const tr = useT();
  const [failed, setFailed] = useState(false);

  async function open(provider: Provider) {
    setFailed(false);
    try {
      const idToken = await firebaseIdToken(provider);
      if (idToken) onCredential(idToken, "loginWithFirebase");
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="space-y-3">
      <GoogleButton onCredential={(idToken) => onCredential(idToken, "loginWithGoogle")} />
      {PROVIDERS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => void open(p)}
          className={`mx-auto flex h-10 w-full max-w-[400px] items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90 ${
            p === "apple" ? "bg-black dark:border dark:border-stone-600" : "bg-[#1877F2]"
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
            <path d={MARKS[p]} />
          </svg>
          {p === "apple" ? tr.auth.continueWithApple : tr.auth.continueWithFacebook}
        </button>
      ))}
      {PROVIDERS.includes("apple") && (
        <p className="text-center text-xs text-stone-500 dark:text-stone-400">{tr.auth.appleShareEmail}</p>
      )}
      {failed && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {tr.auth.errors.INVALID_LOGIN_TOKEN}
        </p>
      )}
    </div>
  );
}
