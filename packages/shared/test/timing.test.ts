import { describe, expect, it } from "vitest";
import { latencyLabel, messageTrip } from "../src/chats.js";

describe("messageTrip", () => {
  it("splits the trip at the server and leaves out what was not measured", () => {
    const serverAt = "2026-10-29T10:00:00.200Z";
    expect(messageTrip({ sentAt: "2026-10-29T10:00:00.000Z", serverAt, arrivedAt: "2026-10-29T10:00:00.650Z" })).toEqual({
      up: 200,
      down: 450,
      total: 650,
    });
    expect(messageTrip({ sentAt: null, serverAt, arrivedAt: null })).toEqual({ up: null, down: null, total: null });
  });

  it("labels short trips in ms and long ones in seconds or minutes", () => {
    expect(latencyLabel(450)).toBe("450 ms");
    expect(latencyLabel(1520)).toBe("1.5 s");
    expect(latencyLabel(180_000)).toBe("3 min");
  });
});
