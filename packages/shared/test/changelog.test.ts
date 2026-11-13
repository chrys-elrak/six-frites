import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHANGELOG, LOCALES, isNewerVersion, parseReleaseNotes, releaseAnnouncement } from "../src/index.js";

describe("release notes", () => {
  it("reads the sections newest first, gives a missing language the English notes, and titles the message in bold", () => {
    const markdown = "# Notes\n\nintro\n\n## 2026-01-02 10h00\n\n### en\n- B\n\n### fr\n- Bé\n\n## 2026-01-01 09h30\n\n### en\n- A1\n- A2\n";
    expect(parseReleaseNotes(markdown)).toEqual([
      { id: "2026-01-02 10h00", notes: { en: ["B"], fr: ["Bé"], mg: ["B"] } },
      { id: "2026-01-01 09h30", notes: { en: ["A1", "A2"], fr: ["A1", "A2"], mg: ["A1", "A2"] } },
    ]);
    expect(releaseAnnouncement(["Bé", "C"], "fr")).toEqual({ text: "Nouveautés\n\n• Bé\n• C", entities: [{ type: "bold", offset: 0, length: 10 }] });
  });

  it("has every section of RELEASE_NOTES.md dated, newer than the one below, and written in every language", () => {
    const sections = parseReleaseNotes(readFileSync(new URL("../../../RELEASE_NOTES.md", import.meta.url), "utf8"));
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach((s, i) => {
      expect(s.id).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}h\d{2}$/);
      if (i) expect(sections[i - 1]!.id > s.id, `${s.id} is not older than the section above it`).toBe(true);
      expect(s.notes.en.length, s.id).toBeGreaterThan(0);
      for (const l of LOCALES) {
        expect(s.notes[l].length, `${s.id} ${l}`).toBe(s.notes.en.length);
        if (l !== "en") expect(s.notes[l], `${s.id} ${l}`).not.toEqual(s.notes.en);
        expect(releaseAnnouncement(s.notes[l], l).text.length).toBeLessThanOrEqual(4000);
      }
    });
  });
});

describe("CHANGELOG", () => {
  it("is newest first and has notes in every language", () => {
    CHANGELOG.slice(1).forEach((r, i) => expect(isNewerVersion(CHANGELOG[i]!.version, r.version)).toBe(true));
    for (const r of CHANGELOG) for (const l of LOCALES) expect(r.notes[l].length).toBe(r.notes.en.length);
  });
});
