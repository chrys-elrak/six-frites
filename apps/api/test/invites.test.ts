import { describe, expect, it } from "vitest";
import { bearer, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call } = chatHelpers(ctx);

async function createInvite(token: string, body: Record<string, unknown> = {}) {
  const res = await ctx.app.inject({ method: "POST", url: "/v1/invites", headers: bearer(token), payload: body });
  expect(res.statusCode).toBe(201);
  return res.json();
}

const preview = async (code: string) => (await ctx.app.inject({ url: `/v1/invites/${code}` })).json();

const signUpError = async (name: string, inviteCode: string) =>
  ((await signUp(name, { inviteCode })) as unknown as { error: { code: string } }).error.code;

describe("invites", () => {
  it("creates a readable code with a message and shows a public preview", async () => {
    const host = await signUp("host");
    const invite = await createInvite(host.accessToken, { maxUses: 2, expiresInDays: 3, message: " Come chat! " });
    expect(invite.code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(invite).toMatchObject({ maxUses: 2, uses: 0, status: "valid", message: "Come chat!" });
    expect(Date.parse(invite.expiresAt) - Date.now()).toBeGreaterThan(2.9 * 864e5);

    const shown = await preview(invite.code.toLowerCase());
    expect(shown).toMatchObject({ code: invite.code, status: "valid", message: "Come chat!", inviter: { id: host.user.id } });
    expect(shown.inviter.email).toBeUndefined();

    const plain = await createInvite(host.accessToken);
    expect(plain).toMatchObject({ maxUses: 1, message: null });
  });

  it("caps links at 10 people and 30 days", async () => {
    const host = await signUp("greedy");
    for (const body of [{ maxUses: 11 }, { expiresInDays: 31 }, { maxUses: 0 }, { message: "x".repeat(501) }]) {
      const res = await ctx.app.inject({ method: "POST", url: "/v1/invites", headers: bearer(host.accessToken), payload: body });
      expect(res.statusCode).toBe(400);
    }
    await createInvite(host.accessToken, { maxUses: 10, expiresInDays: 30 });
  });

  it("only counts new accounts, and labels them with the link", async () => {
    const host = await signUp("referrer");
    const existing = await signUp("existing");
    const { code } = await createInvite(host.accessToken, { maxUses: 1 });

    const accept = (who: { accessToken: string }) =>
      ctx.app.inject({ method: "POST", url: `/v1/invites/${code}/accept`, headers: bearer(who.accessToken) });
    expect((await accept(existing)).json()).toMatchObject({ referrer: { id: host.user.id } });
    expect((await get(existing, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toContain(host.user.id);
    expect((await preview(code)).status).toBe("valid");

    const newcomer = await signUp("newcomer", { inviteCode: code });
    expect((await get(newcomer, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toContain(host.user.id);
    expect((await accept(newcomer)).json()).toMatchObject({ referrer: { id: host.user.id } });
    expect((await preview(code)).status).toBe("exhausted");

    expect(await signUpError("late", code)).toBe("INVITE_EXHAUSTED");
    expect((await accept(await signUp("late-existing"))).json().error.code).toBe("INVITE_EXHAUSTED");
    expect((await accept(host)).json().error.code).toBe("INVITE_OWN");

    const referrals = await get(host, "/v1/me/referrals");
    expect(referrals.items).toHaveLength(1);
    expect(referrals.items[0]).toMatchObject({ user: { id: newcomer.user.id }, inviteCode: code });
  });

  it("lets the owner revoke a link", async () => {
    const host = await signUp("revoker");
    const { code } = await createInvite(host.accessToken, { maxUses: 5 });
    const joined = await signUp("before", { inviteCode: code });

    const other = await signUp("stranger");
    expect((await call(other, "POST", `/v1/invites/${code}/revoke`)).json().error.code).toBe("INVITE_NOT_FOUND");

    const revoked = await call(host, "POST", `/v1/invites/${code}/revoke`);
    expect(revoked.json()).toMatchObject({ code, status: "revoked", uses: 1 });
    expect((await preview(code)).status).toBe("revoked");
    expect(await signUpError("after", code)).toBe("INVITE_REVOKED");
    const accept = await call(other, "POST", `/v1/invites/${code}/accept`);
    expect(accept.json().error.code).toBe("INVITE_REVOKED");

    expect((await get(joined, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toContain(host.user.id);
    const listed = await get(host, "/v1/invites");
    expect(listed.items).toMatchObject([{ code, status: "revoked" }]);
  });

  it("returns INVITE_NOT_FOUND for unknown codes", async () => {
    const res = await ctx.app.inject({ url: "/v1/invites/NOPE2345" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("INVITE_NOT_FOUND");
  });
});
