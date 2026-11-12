import { vi } from "vitest";

vi.mock("../src/lib/google.js", () => ({
  verifyGoogleIdToken: async (idToken: string) => {
    if (!idToken.startsWith("google:")) {
      const { AppError } = await import("@six/shared");
      throw new AppError("INVALID_GOOGLE_TOKEN");
    }
    const sub = idToken.slice(7);
    return { sub, email: `${sub}@example.com`, name: sub, picture: null };
  },
}));

vi.mock("../src/lib/firebase.js", () => ({
  verifyFirebaseIdToken: async (idToken: string) => {
    const { AppError } = await import("@six/shared");
    if (!idToken.startsWith("firebase:")) throw new AppError("INVALID_LOGIN_TOKEN");
    const p = JSON.parse(idToken.slice(9));
    if (!p.email) throw new AppError("EMAIL_REQUIRED");
    return { googleSub: null, providers: [], emailVerified: true, name: p.uid, picture: null, ...p };
  },
}));
