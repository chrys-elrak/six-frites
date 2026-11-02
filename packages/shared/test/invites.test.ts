import { describe, expect, it } from "vitest";
import { dict, type InviteDTO, inviteLimitNote, invitePlacesLeft, inviteSummary, quotaSummary } from "../src/index.js";

const invite = (over: Partial<InviteDTO>): InviteDTO => ({
  code: "ABCD2345",
  message: null,
  maxUses: 5,
  uses: 2,
  expiresAt: new Date(Date.now() + 3 * 864e5 - 1000).toISOString(),
  status: "valid",
  createdAt: new Date().toISOString(),
  ...over,
});

describe("inviteSummary", () => {
  const t = dict.en;

  it("shows places taken and time left", () => {
    expect(inviteSummary(invite({}), t)).toBe("2 of 5 joined · Expires in 3 days");
    const soon = new Date(Date.now() + 90 * 60_000).toISOString();
    expect(inviteSummary(invite({ expiresAt: soon }), t)).toBe("2 of 5 joined · Expires in 2 hours");
    expect(inviteSummary(invite({ maxUses: null, expiresAt: null }), t)).toBe("2 joined · Never expires");
  });

  it("says why a link stopped working", () => {
    expect(inviteSummary(invite({ status: "revoked" }), t)).toBe("2 of 5 joined · Revoked");
    expect(inviteSummary(invite({ status: "exhausted", uses: 5 }), t)).toBe("5 of 5 joined · Used up");
    const past = new Date(Date.now() - 1000).toISOString();
    expect(inviteSummary(invite({ status: "expired", expiresAt: past }), t)).toBe("2 of 5 joined · Expired");
  });
});

describe("invite places", () => {
  const t = dict.en;

  it("leaves my limit less who joined, who waits and what my links hold, ten at most per link", () => {
    expect(invitePlacesLeft({ limit: 10, invited: 2, waiting: 0, held: 3 })).toBe(5);
    expect(invitePlacesLeft({ limit: 50, invited: 0, waiting: 0, held: 0 })).toBe(10);
    expect(invitePlacesLeft({ limit: null, invited: 99, waiting: 0, held: 99 })).toBe(10);
    expect(quotaSummary({ limit: 10, invited: 2, waiting: 0, held: 3 }, t)).toBe("2 of 10 invites used · 3 held by your links");
  });

  it("says whether my links or the people who joined took the last places", () => {
    expect(inviteLimitNote({ limit: 10, invited: 2, waiting: 0, held: 3 }, t)).toBeNull();
    expect(inviteLimitNote({ limit: 10, invited: 2, waiting: 0, held: 8 }, t)).toBe(t.settings.placesHeld);
    expect(inviteLimitNote({ limit: 10, invited: 9, waiting: 1, held: 0 }, t)).toBe(t.settings.inviteLimitReached);
  });
});
