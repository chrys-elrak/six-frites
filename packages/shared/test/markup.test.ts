import { describe, expect, it } from "vitest";
import { entitiesFit } from "../src/chats.js";
import { applyEdit, gradientLetters, markupMap, parseMarkup, parseRaw, plainAt, segments, toMarkup, toggleFormat } from "../../../apps/web/lib/markup.js";

describe("markup", () => {
  it("reads colours, fonts and underline, nested in other styles, and writes them back", () => {
    const raw = "hey {red:**big** news} and ++{serif:fancy}++ {nope:this} }";
    const { text, entities } = parseMarkup(raw);
    expect(text).toBe("hey big news and fancy {nope:this} }");
    expect(entities).toEqual(
      expect.arrayContaining([
        { type: "color", value: "red", offset: 4, length: 8 },
        { type: "bold", offset: 4, length: 3 },
        { type: "underline", offset: 17, length: 5 },
        { type: "font", value: "serif", offset: 17, length: 5 },
      ]),
    );
    expect(entitiesFit(text, entities)).toBe(true);
    const back = parseMarkup(toMarkup(text, entities));
    const byType = (list: typeof entities) => [...list].sort((a, b) => a.offset - b.offset || a.type.localeCompare(b.type));
    expect(back.text).toBe(text);
    expect(byType(back.entities)).toEqual(byType(entities));
    expect(segments(text, entities).find((s) => s.text === "big")).toMatchObject({ color: "red", styles: new Set(["color", "bold"]) });
  });

  it("refuses colours and fonts the apps don't know, and values on plain styles", () => {
    expect(entitiesFit("hello", [{ type: "color", value: "teal", offset: 0, length: 5 }])).toBe(false);
    expect(entitiesFit("hello", [{ type: "font", offset: 0, length: 5 }])).toBe(false);
    expect(entitiesFit("hello", [{ type: "bold", value: "red", offset: 0, length: 5 }])).toBe(false);
    expect(entitiesFit("hello", [{ type: "font", value: "script", offset: 0, length: 5 }])).toBe(true);
  });
});

describe("editing formatted text", () => {
  const bold = [{ type: "bold" as const, offset: 4, length: 4 }];

  it("carries a style on when typing at the end of it, not at its start, and shrinks it on delete", () => {
    expect(applyEdit("hey bold!", "hey bolder!", bold)).toEqual([{ type: "bold", offset: 4, length: 6 }]);
    expect(applyEdit("hey bold!", "hey Xbold!", bold)).toEqual([{ type: "bold", offset: 5, length: 4 }]);
    expect(applyEdit("hey bold!", "hey bod!", bold)).toEqual([{ type: "bold", offset: 4, length: 3 }]);
    expect(applyEdit("hey bold!", "hey !", bold)).toEqual([]);
    expect(applyEdit("hey bold!", "he bold!", bold)).toEqual([{ type: "bold", offset: 3, length: 4 }]);
  });

  it("toggles a style over a selection, and swaps one colour for another", () => {
    expect(toggleFormat(bold, 4, 6, "bold")).toEqual([{ type: "bold", offset: 6, length: 2 }]);
    expect(toggleFormat(bold, 0, 6, "bold")).toEqual([{ type: "bold", offset: 0, length: 8 }]);
    const red = toggleFormat([], 0, 5, "color", "red");
    expect(toggleFormat(red, 2, 5, "color", "blue")).toEqual([
      { type: "color", value: "red", offset: 0, length: 2 },
      { type: "color", value: "blue", offset: 2, length: 3 },
    ]);
    expect(toggleFormat(red, 0, 5, "color", "red")).toEqual([]);
  });

  it("maps places between the text and its markup both ways, and keeps trailing spaces while typing", () => {
    const { markup, at } = markupMap("hey bold!", bold);
    expect(markup).toBe("hey **bold**!");
    expect(at[4]).toBe(6);
    expect(at[9]).toBe(13);
    expect(plainAt(at, 6)).toBe(4);
    expect(plainAt(at, 4)).toBe(4);
    expect(plainAt(at, 13)).toBe(9);
    expect(parseRaw("hi **there** ").text).toBe("hi there ");
  });
});

describe("sizes, custom colours and gradients", () => {
  it("reads them from markup and accepts only well-formed ones", () => {
    const { text, entities } = parseMarkup("{28:big} {#ff00aa:pink} {#ff00aa-#3b82f6:fade} {sunset:glow} {#zz0000:no}");
    expect(text).toBe("big pink fade glow {#zz0000:no}");
    expect(entities.map((e) => `${e.type}:${e.value}`)).toEqual(["size:28", "color:#ff00aa", "color:#ff00aa-#3b82f6", "color:sunset"]);
    expect(entitiesFit(text, entities)).toBe(true);
    expect(entitiesFit("ab", [{ type: "size", value: "60", offset: 0, length: 2 }])).toBe(false);
    expect(entitiesFit("ab", [{ type: "size", value: "huge", offset: 0, length: 2 }])).toBe(false);
    expect(entitiesFit("ab", [{ type: "font", value: "pixel", offset: 0, length: 2 }])).toBe(true);
    expect(entitiesFit("ab", [{ type: "color", value: "#ff00aa-", offset: 0, length: 2 }])).toBe(false);
  });

  it("colours a gradient letter by letter from one end to the other", () => {
    const { text, entities } = parseMarkup("{#000000-#ffffff:abc}");
    const [seg] = segments(text, entities);
    expect(gradientLetters(seg!).map((l) => l.color)).toEqual(["#000000", "#808080", "#ffffff"]);
  });
});
