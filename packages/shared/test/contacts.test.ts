import { describe, expect, it } from "vitest";
import { sortContacts } from "../src/contacts.js";

const c = (id: string, addedAt: string) => ({ user: { id }, addedAt });
const list = [c("ana", "2026-01-01T00:00:00Z"), c("bo", "2026-03-01T00:00:00Z"), c("cy", "2026-02-01T00:00:00Z")];
const seen = {
  ana: { online: false, lastSeenAt: "2026-11-01T10:00:00Z" },
  bo: { online: false, lastSeenAt: null },
  cy: { online: true, lastSeenAt: null },
};

describe("sortContacts", () => {
  it("keeps the A to Z order by name", () => {
    expect(sortContacts(list, "name", () => undefined)).toBe(list);
  });

  it("puts whoever is online first, then the most recently seen, then those never seen", () => {
    expect(sortContacts(list, "active", (id) => seen[id as keyof typeof seen]).map((x) => x.user.id)).toEqual(["cy", "ana", "bo"]);
  });

  it("puts the newest contacts first", () => {
    expect(sortContacts(list, "added", () => undefined).map((x) => x.user.id)).toEqual(["bo", "cy", "ana"]);
  });
});
