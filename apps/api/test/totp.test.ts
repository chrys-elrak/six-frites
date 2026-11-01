import { describe, expect, it } from "vitest";
import { matchTotp, newTotpSecret, totp } from "../src/lib/totp.js";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("authenticator codes", () => {
  it("match the RFC 6238 test vectors", () => {
    expect(totp(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totp(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totp(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totp(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("take a step of clock drift either way, and nothing further", () => {
    const now = 1234567890_000;
    const step = Math.floor(now / 30_000);
    expect(matchTotp(RFC_SECRET, totp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totp(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totp(RFC_SECRET, step + 2), now)).toBeNull();
  });

  it("makes fresh base32 secrets", () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(newTotpSecret()).not.toBe(secret);
  });
});
