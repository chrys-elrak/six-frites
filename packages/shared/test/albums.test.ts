import { describe, expect, it } from "vitest";
import { albumIds } from "../src/chats.js";

describe("albumIds", () => {
  const ids = () => {
    let n = 0;
    return () => `g${++n}`;
  };

  it("groups photos and videos ten at a time and leaves other files alone", () => {
    expect(albumIds(["image"], ids())).toEqual([undefined]);
    expect(albumIds(["image", "file", "video"], ids())).toEqual(["g1", undefined, "g1"]);
    const twelve = albumIds(Array(12).fill("image"), ids());
    expect(twelve.filter((g) => g === "g1")).toHaveLength(10);
    expect(twelve.slice(10)).toEqual(["g2", "g2"]);
  });
});
