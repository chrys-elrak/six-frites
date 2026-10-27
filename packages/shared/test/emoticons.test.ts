import { describe, expect, it } from "vitest";
import emojis from "../src/emojis.json";
import { type EmojiEntry, emojiQuery, emojifyEnd, emojifyTyped, suggestEmoji } from "../src/emoticons.js";

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

describe("emoji suggestions", () => {
  const all = (emojis as { data: EmojiEntry[] }[]).flatMap((c) => c.data);

  it("finds the :name typed before the caret", () => {
    expect(emojiQuery("hi :smi", 7)).toEqual({ start: 3, query: "smi" });
    expect(emojiQuery(":Thumbs_up", 10)).toEqual({ start: 0, query: "thumbs_up" });
    expect(emojiQuery("hi :s", 5)).toBeNull();
    expect(emojiQuery("http://x", 8)).toBeNull();
    expect(emojiQuery("at 10:30", 8)).toBeNull();
    expect(emojiQuery("`a :smi", 7)).toBeNull();
    expect(emojiQuery("hi :smi there", 13)).toBeNull();
  });

  it("puts exact names first, then shorter ones", () => {
    expect(suggestEmoji(all, "thumbs_up")[0]!.e).toBe("👍");
    expect(suggestEmoji(all, "heart")[0]!.e).toBe("❤️");
    expect(suggestEmoji(all, "fire")[0]!.e).toBe("🔥");
    const smi = suggestEmoji(all, "smi");
    expect(smi).toHaveLength(8);
    expect(smi.every((x) => x.n.split(" ").some((w) => w.startsWith("smi")))).toBe(true);
    expect(suggestEmoji(all, "zzzzqq")).toEqual([]);
  });
});
