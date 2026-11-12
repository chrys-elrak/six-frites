import { describe, expect, it } from "vitest";
import { NOTE_LIMIT, STORY_LIMITS, shareTargets } from "../src/stories.js";

describe("putting a message up as a story or a note", () => {
  it("offers both for a short message, trimmed", () => {
    expect(shareTargets("  hello  ")).toEqual({ text: "hello", story: true, note: true });
  });

  it("keeps a message too long for a note as a story only", () => {
    expect(shareTargets("a".repeat(NOTE_LIMIT + 1))).toMatchObject({ story: true, note: false });
    expect(shareTargets("a".repeat(NOTE_LIMIT))).toMatchObject({ note: true });
  });

  it("offers neither for an empty or very long message", () => {
    expect(shareTargets("   ")).toMatchObject({ story: false, note: false });
    expect(shareTargets(null)).toMatchObject({ story: false, note: false });
    expect(shareTargets("a".repeat(STORY_LIMITS.text + 1))).toMatchObject({ story: false, note: false });
  });
});
