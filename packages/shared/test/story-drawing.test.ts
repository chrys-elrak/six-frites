import { describe, expect, it } from "vitest";
import { extendStroke, landOnTop, startStroke, stickersOn, storyStrokePath, strokeTooSmall } from "../src/stories.js";

describe("story drawing", () => {
  it("grows a pen line, stretches a shape, and draws an arrow with its head at the far end", () => {
    let pen = startStroke("pen", "#ffffff", 0.01, 0.1, 0.1);
    pen = extendStroke(extendStroke(pen, 0.1001, 0.1), 0.5, 2);
    expect(pen.points).toEqual([0.1, 0.1, 0.1, 0.1, 0.5, 1.25]);

    const arrow = extendStroke(extendStroke(startStroke("arrow", "#ffffff", 0.01, 0, 0), 0.2, 0.2), 0.5, 0);
    expect(arrow.points).toEqual([0, 0, 0.5, 0]);
    expect(storyStrokePath(arrow, 100, 200)).toMatch(/^M0 0L50 0M[\d.]+ [\d.-]+L50 0L[\d.]+ [\d.-]+$/);
    expect(storyStrokePath(extendStroke(startStroke("rect", "#ffffff", 0.01, 0, 0), 1, 1), 10, 20)).toBe("M0 0H10V20H0Z");

    expect(strokeTooSmall(startStroke("circle", "#ffffff", 0.01, 0.5, 0.5))).toBe(true);
    expect(strokeTooSmall(startStroke("pen", "#ffffff", 0.01, 0.5, 0.5))).toBe(false);
  });

  it("lists a story's stickers, and lands new ones near the top above everything already there", () => {
    const on = stickersOn({ asks: 2, gifs: 0, photos: 1, link: true, askLink: false, location: false, showDate: true, showTime: false });
    expect(on).toEqual(["ask", "ask2", "photo", "date", "link"]);
    const placed = landOnTop({ ask: { x: 0.1, y: 0.9, z: 4 } }, [{ z: 7 }], ["ask2", "date"]);
    expect(placed.ask2).toEqual({ x: 0.5, y: 0.25, scale: 0.75, z: 8 });
    expect(placed.date).toEqual({ x: 0.5, y: 0.25, z: 9 });
    expect(placed.ask).toEqual({ x: 0.1, y: 0.9, z: 4 });
  });
});
