import { describe, expect, it } from "vitest";
import { messageLinks, previewLink } from "../src/links.js";

describe("messageLinks", () => {
  it("finds every link outside code and spoilers", () => {
    const text = "see https://a.mg and https://code.mg then www.secret.mg or www.b.mg.";
    const at = (s: string) => ({ offset: text.indexOf(s), length: s.length });
    const entities = [
      { type: "code" as const, ...at("https://code.mg") },
      { type: "spoiler" as const, ...at("www.secret.mg") },
    ];
    expect(messageLinks(text, entities)).toEqual([
      { text: "https://a.mg", href: "https://a.mg" },
      { text: "www.b.mg", href: "https://www.b.mg" },
    ]);
    expect(previewLink(text, entities)).toBe("https://a.mg");
    expect(previewLink("no links")).toBeNull();
  });
});
