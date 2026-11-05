import { describe, expect, it } from "vitest";
import { dict } from "../src/i18n/index.js";
import { serviceText } from "../src/preview.js";

describe("live results", () => {
  const result = (action: object) => serviceText({ action } as Parameters<typeof serviceText>[0], dict.en);

  it("reads with the score in the games that keep one", () => {
    expect(result({ type: "live_result", game: "memory", result: "won", score: [5, 3] })).toBe("You won Memory 🎉 · 5–3");
    expect(result({ type: "live_result", game: "ludo", result: "lost" })).toBe("Six Frites Game won Ludo");
  });
});
