import { describe, expect, it } from "vitest";
import { findInText } from "../src/search.js";

describe("findInText", () => {
  it("ignores case and accents and keeps the original text", () => {
    expect(findInText("Rendez-vous à l'Hôtel cet été", "hotel")).toEqual({
      before: "Rendez-vous à l'",
      match: "Hôtel",
      after: " cet été",
    });
    expect(findInText("Cet ÉTÉ-là", "ete")?.match).toBe("ÉTÉ");
    expect(findInText("été", "ete")?.match).toBe("été");
    expect(findInText("Salama 👋 tompoko", "tompoko")).toMatchObject({ before: "Salama 👋 ", match: "tompoko" });
  });

  it("cuts long text around the match, and finds nothing for a blank or missing query", () => {
    const hit = findInText(`${"a".repeat(100)} needle ${"b".repeat(200)}`, "needle", 10)!;
    expect(hit.before).toBe(`…${"a".repeat(9)} `);
    expect(hit.after).toBe(` ${"b".repeat(19)}…`);
    expect(findInText("hello", "  ")).toBeNull();
    expect(findInText("hello", "bye")).toBeNull();
  });
});
