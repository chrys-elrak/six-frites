import { describe, expect, it } from "vitest";
import { generateLinkKey, openWithLinkKey, sealToLinkKey } from "../src/link.js";

describe("link keys", () => {
  it("opens only with the key the secret was sealed to", () => {
    const computer = generateLinkKey();
    const secret = new Uint8Array(32).fill(7);
    const sealed = sealToLinkKey(computer.pub, secret);
    expect(openWithLinkKey(computer, sealed)).toEqual(secret);
    expect(() => openWithLinkKey(generateLinkKey(), sealed)).toThrow("link key");
  });
});
