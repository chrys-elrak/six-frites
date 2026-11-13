import { describe, expect, it } from "vitest";
import { CHANGELOG, LOCALES, MessageEntity, isNewerVersion, releaseAnnouncement } from "../src/index.js";

describe("releaseAnnouncement", () => {
  it("gives every version a message short enough to send, titled in bold, with its notes in that language", () => {
    for (const r of CHANGELOG) {
      for (const l of LOCALES) {
        const { text, entities } = releaseAnnouncement(r.version, l);
        expect(text.length).toBeLessThanOrEqual(4000);
        expect(MessageEntity.array().parse(entities)).toHaveLength(1);
        expect(text.slice(0, entities[0]!.length)).toContain(r.version);
        expect(text.endsWith(`• ${r.notes[l].at(-1)}`)).toBe(true);
      }
    }
  });

  it("falls back to the notes it is given for a version the changelog doesn't have", () => {
    expect(releaseAnnouncement("0.0.1", "fr", "• From the store").text).toBe("Nouveautés · Version 0.0.1\n\n• From the store");
  });
});

describe("CHANGELOG", () => {
  it("is newest first and has notes in every language", () => {
    CHANGELOG.slice(1).forEach((r, i) => expect(isNewerVersion(CHANGELOG[i]!.version, r.version)).toBe(true));
    for (const r of CHANGELOG) for (const l of LOCALES) expect(r.notes[l].length).toBe(r.notes.en.length);
  });
});
