const PENDING = "six-facebook-sign-in";
const RESULT = "six-facebook-result";

export type FacebookResult = { idToken?: string; error?: "EMAIL_TAKEN" | "INVALID_LOGIN_TOKEN" };

async function idp(method: string, body: object) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { authUri?: string; sessionId?: string; idToken?: string; needConfirmation?: boolean };
}

/**
 * Sends this tab to Facebook through Firebase's REST API instead of its /__/auth/handler page. The handler keeps its
 * state in one tab's sessionStorage, which is lost when the Facebook app hands the login back to Chrome in a new tab;
 * here it goes in localStorage, which every tab shares. `pub` is the phone app's one-time key, when it asked.
 */
export async function goToFacebook(pub?: string) {
  const { authUri, sessionId } = await idp("createAuthUri", {
    providerId: "facebook.com",
    continueUri: `${location.origin}/auth/facebook`,
    oauthScope: "email",
  });
  if (!authUri || !sessionId) throw new Error("INVALID_LOGIN_TOKEN");
  localStorage.setItem(PENDING, JSON.stringify({ sessionId, pub }));
  location.replace(authUri);
}

/** Back from Facebook: swaps its code for a Firebase ID token, with the app's key when the app started it. */
export async function finishFacebook(): Promise<FacebookResult & { pub?: string }> {
  const pending = JSON.parse(localStorage.getItem(PENDING) ?? "null") as { sessionId: string; pub?: string } | null;
  localStorage.removeItem(PENDING);
  if (!pending) return { error: "INVALID_LOGIN_TOKEN" };
  if (!new URLSearchParams(location.search).has("code")) return { pub: pending.pub };
  const body = await idp("signInWithIdp", { requestUri: location.href, sessionId: pending.sessionId, returnSecureToken: true });
  if (body.needConfirmation) return { error: "EMAIL_TAKEN", pub: pending.pub };
  return body.idToken ? { idToken: body.idToken, pub: pending.pub } : { error: "INVALID_LOGIN_TOKEN", pub: pending.pub };
}

export function shareFacebookResult(result: FacebookResult) {
  localStorage.setItem(RESULT, JSON.stringify(result));
}

/**
 * Opens Facebook's sign-in in a popup (a tab on phones) and waits for /auth/facebook to share the result, from that
 * popup or from the new tab the Facebook app came back in. Resolves null when they backed out.
 */
export function facebookIdToken(): Promise<string | null> {
  localStorage.removeItem(RESULT);
  window.open("/auth/facebook", "facebook", "popup,width=500,height=650");
  return new Promise((resolve, reject) => {
    function check() {
      const raw = localStorage.getItem(RESULT);
      if (!raw) return;
      localStorage.removeItem(RESULT);
      removeEventListener("storage", check);
      removeEventListener("focus", check);
      const { idToken, error } = JSON.parse(raw) as FacebookResult;
      if (error) reject(Object.assign(new Error(error), { code: error }));
      else resolve(idToken ?? null);
    }
    addEventListener("storage", check);
    addEventListener("focus", check);
  });
}
