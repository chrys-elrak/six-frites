import { describe, expect, it } from "vitest";
import { CHANGELOG, LOCALES, type Release, isNewerVersion, unseenReleases } from "../src/index.js";

const notes = { en: [], fr: [], mg: [] };
const log: Release[] = ["1.6.0", "1.5.0", "1.4.0"].map((version) => ({ version, date: "2026-10-30", notes }));

describe("unseenReleases", () => {
  it("lists what came out after the last release read", () => {
    expect(unseenReleases("1.4.0", log).map((r) => r.version)).toEqual(["1.6.0", "1.5.0"]);
    expect(unseenReleases("1.6.0", log)).toEqual([]);
  });

  it("shows only the newest when nothing was read yet", () => {
    expect(unseenReleases(null, log).map((r) => r.version)).toEqual(["1.6.0"]);
  });
});

describe("CHANGELOG", () => {
  it("is newest first and has notes in every language", () => {
    CHANGELOG.slice(1).forEach((r, i) => expect(isNewerVersion(CHANGELOG[i]!.version, r.version)).toBe(true));
    for (const r of CHANGELOG) for (const l of LOCALES) expect(r.notes[l].length).toBe(r.notes.en.length);
  });
});
