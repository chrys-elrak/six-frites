import { AppError, SIGN_IN_PROVIDERS, type SignInProvider } from "@six/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env.js";

export interface FirebaseIdentity {
  uid: string;
  googleSub: string | null;
  providers: SignInProvider[];
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export type FirebaseVerifier = (idToken: string) => Promise<FirebaseIdentity>;

const keys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

interface FirebaseClaims {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: { identities?: Record<string, string[]>; sign_in_provider?: string };
}

/**
 * The Firebase project is shared with other apps, and whoever holds its public web key can use any sign-in method
 * they switched on there, like email and password with an address that isn't theirs. So only a token from one of
 * our own providers counts.
 */
export const verifyFirebaseIdToken: FirebaseVerifier = async (idToken) => {
  const project = env.FIREBASE_PROJECT_ID;
  let p: FirebaseClaims & { sub?: string };
  try {
    p = (await jwtVerify(idToken, keys, { issuer: `https://securetoken.google.com/${project}`, audience: project }))
      .payload as typeof p;
    if (!p.sub) throw new Error("no subject");
    if (!SIGN_IN_PROVIDERS.some((x) => p.firebase?.sign_in_provider === `${x}.com`)) throw new Error("not one of our providers");
  } catch {
    throw new AppError("INVALID_LOGIN_TOKEN", "Firebase ID token could not be verified");
  }
  if (!p.email) throw new AppError("EMAIL_REQUIRED", "This account has no email address");
  return {
    uid: p.sub,
    googleSub: p.firebase?.identities?.["google.com"]?.[0] ?? null,
    providers: SIGN_IN_PROVIDERS.filter((x) => p.firebase?.identities?.[`${x}.com`]),
    email: p.email.toLowerCase(),
    emailVerified: p.email_verified === true,
    name: p.name ?? p.email.split("@")[0]!,
    picture: p.picture ?? null,
  };
};
