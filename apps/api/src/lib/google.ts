import { OAuth2Client } from "google-auth-library";
import { AppError } from "@six/shared";
import { env } from "../env.js";

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

const client = new OAuth2Client();

export const verifyGoogleIdToken: GoogleVerifier = async (idToken) => {
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_IDS });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) throw new Error("unverified");
    return { sub: p.sub, email: p.email, name: p.name ?? p.email.split("@")[0]!, picture: p.picture ?? null };
  } catch {
    throw new AppError("INVALID_GOOGLE_TOKEN", "Google ID token could not be verified");
  }
};
