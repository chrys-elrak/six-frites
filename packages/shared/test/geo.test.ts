import { describe, expect, it } from "vitest";
import { distanceLabel, distanceMeters, mapTiles } from "../src/chats.js";

describe("places", () => {
  it("measures the distance between two places", () => {
    const tana = { lat: -18.8792, lng: 47.5079 };
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, 0);
    expect(distanceMeters(tana, tana)).toBe(0);
    expect(distanceLabel(349.6)).toBe("350 m");
    expect(distanceLabel(2345)).toBe("2.3 km");
    expect(distanceLabel(119_700)).toBe("120 km");
  });

  it("covers the whole view with tiles around the place", () => {
    const tiles = mapTiles({ lat: -18.8792, lng: 47.5079 }, 768, 192);
    for (const [x, y] of [[0, 0], [767, 191], [384, 96]] as const)
      expect(tiles.some((t) => t.x <= x && x < t.x + 256 && t.y <= y && y < t.y + 256)).toBe(true);
    expect(tiles.every((t) => t.url.startsWith("https://tile.openstreetmap.org/15/"))).toBe(true);
  });
});
