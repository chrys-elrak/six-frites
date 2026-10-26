import { describe, expect, it } from "vitest";
import { bearer, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();

async function signUp(name: string, extra: Record<string, unknown> = {}) {
  const res = await loginAs(ctx.app, uniqueSub(name), "ios", extra);
  return res.json();
}

async function createInvite(token: string, body: Record<string, unknown> = {}) {
  const res = await ctx.app.inject({ method: "POST", url: "/v1/invites", headers: bearer(token), payload: body });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("invites", () => {
  it("creates a readable code and shows a public preview", async () => {
    const host = await signUp("host");
    const invite = await createInvite(host.accessToken, { maxUses: 2 });
    expect(invite.code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(invite).toMatchObject({ expiresAt: null, maxUses: null });

    const preview = await ctx.app.inject({ url: `/v1/invites/${invite.code.toLowerCase()}` });
    expect(preview.json()).toMatchObject({ code: invite.code, status: "valid", inviter: { id: host.user.id } });
    expect(preview.json().inviter.email).toBeUndefined();
  });

  it("gives everyone a single link that can be reset", async () => {
    const host = await signUp("single");
    const mine = () => ctx.app.inject({ url: "/v1/me/invite", headers: bearer(host.accessToken) });
    const first = (await mine()).json();
    expect((await mine()).json().code).toBe(first.code);
    expect((await createInvite(host.accessToken)).code).toBe(first.code);

    const guest = await signUp("joiner", { inviteCode: first.code });
    expect(guest.user).toBeDefined();
    expect((await mine()).json().uses).toBe(1);

    const reset = await ctx.app.inject({
      method: "POST",
      url: "/v1/me/invite/reset",
      headers: bearer(host.accessToken),
    });
    expect(reset.json().code).not.toBe(first.code);
    expect(reset.json().uses).toBe(1);
    expect((await ctx.app.inject({ url: `/v1/invites/${first.code}` })).json().error.code).toBe("INVITE_NOT_FOUND");

    const listed = (await ctx.app.inject({ url: "/v1/invites", headers: bearer(host.accessToken) })).json();
    expect(listed.items.map((i: { code: string }) => i.code)).toEqual([reset.json().code]);
    const referrals = (await ctx.app.inject({ url: "/v1/me/referrals", headers: bearer(host.accessToken) })).json();
    expect(referrals.items).toHaveLength(1);
  });

  it("lets a signed-in user accept once and shows up in referrals", async () => {
    const host = await signUp("referrer");
    const guest = await signUp("guest");
    const { code } = await createInvite(host.accessToken);

    const accept = () =>
      ctx.app.inject({ method: "POST", url: `/v1/invites/${code}/accept`, headers: bearer(guest.accessToken) });
    expect((await accept()).json()).toMatchObject({ referrer: { id: host.user.id } });
    expect((await accept()).json()).toMatchObject({ referrer: { id: host.user.id } });

    const other = await signUp("other-host");
    const { code: otherCode } = await createInvite(other.accessToken);
    const second = await ctx.app.inject({
      method: "POST",
      url: `/v1/invites/${otherCode}/accept`,
      headers: bearer(guest.accessToken),
    });
    expect(second.json().error.code).toBe("ALREADY_REFERRED");

    const own = await ctx.app.inject({
      method: "POST",
      url: `/v1/invites/${code}/accept`,
      headers: bearer(host.accessToken),
    });
    expect(own.json().error.code).toBe("INVITE_OWN");

    const referrals = (await ctx.app.inject({ url: "/v1/me/referrals", headers: bearer(host.accessToken) })).json();
    expect(referrals.items).toHaveLength(1);
    expect(referrals.items[0]).toMatchObject({ user: { id: guest.user.id }, inviteCode: code });
  });

  it("returns INVITE_NOT_FOUND for unknown codes", async () => {
    const res = await ctx.app.inject({ url: "/v1/invites/NOPE2345" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("INVITE_NOT_FOUND");
  });
});
