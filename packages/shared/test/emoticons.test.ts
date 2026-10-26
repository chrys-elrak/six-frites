import { describe, expect, it } from "vitest";
import { emojifyEnd, emojifyTyped } from "../src/emoticons.js";

describe("emoticons", () => {
  it("swaps an emoticon once a space or new line follows it", () => {
    expect(emojifyTyped("love <3", "love <3 ")).toEqual({ text: "love ❤️ ", caret: 8 });
    expect(emojifyTyped("ok :-)", "ok :-)\n")).toEqual({ text: "ok 🙂\n", caret: 6 });
    expect(emojifyTyped(":plater", ":p later")).toEqual({ text: "😛 later", caret: 3 });
  });

  it("leaves emoticons alone inside words, links and code", () => {
    expect(emojifyTyped("a:D", "a:D ")).toBeNull();
    expect(emojifyTyped("http://x", "http://x ")).toBeNull();
    expect(emojifyTyped("`:D", "`:D ")).toBeNull();
    expect(emojifyTyped("`x` :D", "`x` :D ")?.text).toBe("`x` 😄 ");
    expect(emojifyTyped("constructor", "constructor ")).toBeNull();
    expect(emojifyTyped(":D", ":Dx")).toBeNull();
  });

  it("swaps one left at the end when sending", () => {
    expect(emojifyEnd("see you :D \n")).toBe("see you 😄");
    expect(emojifyEnd("nothing here")).toBe("nothing here");
  });
});
