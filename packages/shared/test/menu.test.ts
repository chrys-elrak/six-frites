import { describe, expect, it } from "vitest";
import { placeReactionBar } from "../src/menu.js";

describe("placeReactionBar", () => {
  const screen = { top: 40, bottom: 720, width: 400 };
  const bar = { width: 300, height: 50 };

  it("sits on top of the message, on the message's side", () => {
    expect(placeReactionBar({ x: 250, y: 300, width: 130, height: 40 }, bar, screen, true)).toEqual({ top: 244, left: 80 });
    expect(placeReactionBar({ x: 16, y: 300, width: 130, height: 40 }, bar, screen, false).left).toBe(16);
  });

  it("goes under a message near the top, and stays above the action bar for a tall one", () => {
    expect(placeReactionBar({ x: 16, y: 60, width: 130, height: 40 }, bar, screen, false).top).toBe(106);
    expect(placeReactionBar({ x: 16, y: 0, width: 300, height: 900 }, bar, screen, false).top).toBe(670);
  });
});
