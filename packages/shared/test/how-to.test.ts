import { describe, expect, it } from "vitest";
import { CHAT_GAMES, LIVE_GAMES, LOCALES, dict } from "../src/index.js";

describe("how to play", () => {
  it("explains every game in every language", () => {
    for (const l of LOCALES) {
      for (const g of [...CHAT_GAMES, ...LIVE_GAMES]) {
        expect(dict[l].howTo.steps[g].length).toBe(dict.en.howTo.steps[g].length);
      }
    }
  });
});
