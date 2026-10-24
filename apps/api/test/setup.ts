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
