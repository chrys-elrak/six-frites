import { b64, fromUtf8, generateLinkKey, openWithLinkKey } from "@six/crypto";
import * as AppleAuthentication from "expo-apple-authentication";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { WEB_URL } from "./six";

export type SocialProvider = "apple" | "facebook";

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "";
const BACK = "sixfrites://auth";

/** A sign-in that failed for a reason the server's sign-in messages know, like EMAIL_TAKEN. */
export class SocialSignInError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Signs in with Apple or Facebook and returns a Firebase ID token for /v1/auth/firebase, or null when they backed out.
 * On iPhone, Apple's own sheet; its token is swapped for a Firebase one. Otherwise the website's sign-in runs in a
 * browser tab (/auth/app) and seals the token to a one-time key whose private half never leaves the app.
 */
export async function socialIdToken(provider: SocialProvider): Promise<string | null> {
  if (provider === "apple" && Platform.OS === "ios") return appleOnIphone();
  const link = generateLinkKey();
  const result = await WebBrowser.openAuthSessionAsync(`${WEB_URL}/auth/app?provider=${provider}#${b64(link.pub)}`, BACK);
  if (result.type !== "success") return null;
  const error = /[?&]error=([A-Z_]+)/.exec(result.url)?.[1];
  if (error) throw new SocialSignInError(error);
  const box = /[?&]box=([\w-]+)/.exec(result.url)?.[1];
  return box ? fromUtf8(openWithLinkKey(link, box)) : null;
}

async function appleOnIphone() {
  const nonce = randomUUID();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce),
  }).catch((err: { code?: string }) => {
    if (err.code === "ERR_REQUEST_CANCELED") return null;
    throw err;
  });
  if (!credential?.identityToken) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${credential.identityToken}&providerId=apple.com&nonce=${nonce}`,
      requestUri: "http://localhost",
      returnSecureToken: true,
    }),
  });
  const body = (await res.json()) as { idToken?: string; needConfirmation?: boolean };
  if (body.needConfirmation) throw new SocialSignInError("EMAIL_TAKEN");
  if (!body.idToken) throw new SocialSignInError("INVALID_LOGIN_TOKEN");
  return body.idToken;
}
