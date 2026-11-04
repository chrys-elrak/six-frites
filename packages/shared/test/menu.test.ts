import { describe, expect, it } from "vitest";
import { placeMessageMenu, placeReactionBar } from "../src/menu.js";

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

describe("placeMessageMenu", () => {
  const screen = { top: 40, bottom: 800, width: 400 };
  const bar = { width: 300, height: 50 };
  const card = { width: 200, height: 250 };

  it("puts the reactions on top of the message and the actions under it, on the message's side", () => {
    const spot = placeMessageMenu({ x: 250, y: 300, width: 130, height: 40 }, bar, card, screen, true);
    expect(spot.bar).toEqual({ top: 244, left: 80 });
    expect(spot.card).toEqual({ top: 346, left: 180 });
    expect(placeMessageMenu({ x: 16, y: 300, width: 130, height: 40 }, bar, card, screen, false).card.left).toBe(16);
  });

  it("moves the actions above a message near the bottom, and the reactions under one near the top", () => {
    const low = placeMessageMenu({ x: 16, y: 700, width: 130, height: 40 }, bar, card, screen, false);
    expect(low.bar!.top).toBe(644);
    expect(low.card.top).toBe(644 - 6 - 250);
    const high = placeMessageMenu({ x: 16, y: 60, width: 130, height: 40 }, bar, card, screen, false);
    expect(high.bar!.top).toBe(106);
    expect(high.card.top).toBe(162);
  });

  it("keeps everything on screen for a message taller than it", () => {
    const tall = placeMessageMenu({ x: 16, y: 0, width: 300, height: 900 }, bar, card, screen, false);
    expect(tall.bar!.top).toBe(750);
    expect(tall.card.top).toBe(40);
    expect(placeMessageMenu({ x: 16, y: 300, width: 130, height: 40 }, null, card, screen, false).bar).toBeNull();
  });
});
