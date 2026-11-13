import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ApnsProvider } from "../src/push/providers.js";

describe("APNs", () => {
  it("signs its bearer token with the .p8 key, as ES256", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const apns = new ApnsProvider(privateKey.export({ type: "pkcs8", format: "pem" }) as string, "KEY123", "TEAM456", "com.sixfrites.app");
    const token = (apns as unknown as { bearer(): string }).bearer();
    const [header, claims, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString()).iss).toBe("TEAM456");
    const ok = verify("SHA256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature!, "base64url"));
    expect(ok).toBe(true);
  });
});
