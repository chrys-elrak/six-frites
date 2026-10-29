import { describe, expect, it } from "vitest";
import { fitWaveform } from "../src/uploads.js";

describe("fitWaveform", () => {
  it("keeps short waveforms and squeezes long ones to their peaks", () => {
    expect(fitWaveform([10, 20, 30])).toEqual([10, 20, 30]);
    const long = Array.from({ length: 100 }, (_, i) => i);
    const fitted = fitWaveform(long);
    expect(fitted).toHaveLength(48);
    expect(fitted[0]).toBe(1);
    expect(fitted[47]).toBe(99);
    expect(fitWaveform([5, 50, 7, 3], 2)).toEqual([50, 7]);
  });
});
