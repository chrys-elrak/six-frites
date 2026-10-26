import { expect, it } from "vitest";
import { isNewerVersion } from "../src/releases.js";

it("compares dotted versions number by number", () => {
  expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true);
  expect(isNewerVersion("1.10.0", "1.9.3")).toBe(true);
  expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
  expect(isNewerVersion("1.0.0", "1.1")).toBe(false);
});
