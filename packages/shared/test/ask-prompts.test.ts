import { describe, expect, it } from "vitest";
import { ASK_MAX, ASK_PROMPT_MAX, hasLink, randomAskIdea } from "../src/ask.js";
import { LOCALES } from "../src/i18n/index.js";

describe("random questions and messages", () => {
  it("all fit, have no link and don't repeat, in every language", async () => {
    for (const l of LOCALES) {
      const { prompts, messages } = (await import(`../src/ask-ideas/${l}.ts`)).default as Record<string, string[]>;
      expect(prompts.length).toBeGreaterThanOrEqual(100);
      expect(messages.length).toBeGreaterThanOrEqual(100);
      expect(new Set(prompts).size).toBe(prompts.length);
      expect(new Set(messages).size).toBe(messages.length);
      for (const p of prompts) expect(p.length <= ASK_PROMPT_MAX && !hasLink(p), p).toBe(true);
      for (const m of messages) expect(m.length <= ASK_MAX && !hasLink(m), m).toBe(true);
    }
  });

  it("never gives back the one already there", async () => {
    const current = await randomAskIdea("en", "prompts", "");
    for (let i = 0; i < 30; i++) expect(await randomAskIdea("en", "prompts", current)).not.toBe(current);
  });
});
