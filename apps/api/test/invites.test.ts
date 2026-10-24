import { describe, expect, it } from "vitest";
import { bearer, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();

async function signUp(name: string, extra: Record<string, unknown> = {}) {
  const res = await loginAs(ctx.app, uniqueSub(name), "ios", extra);
  return res.json();
}

async function createInvite(token: string, body: Record<string, unknown> = {}) {
  const res = await ctx.app.inject({ method: "POST", url: "/v1/invites", headers: bearer(token), payload: body });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe("invites", () => {
  it("creates a readable code and shows a public preview", async () => {
    const host = await signUp("host");
    const invite = await createInvite(host.accessToken, { maxUses: 2 });
    expect(invite.code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(invite.expiresAt).not.toBeNull();

    const preview = await ctx.app.inject({ url: `/v1/invites/${invite.code.toLowerCase()}` });
    expect(preview.json()).toMatchObject({ code: invite.code, status: "valid", inviter: { id: host.user.id } });
    expect(preview.json().inviter.email).toBeUndefined();
  });

  it("paginates my invites newest first with a cursor", async () => {
    const host = await signUp("pager");
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await createInvite(host.accessToken)).code);

    const first = (await ctx.app.inject({ url: "/v1/invites?limit=3", headers: bearer(host.accessToken) })).json();
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBeTypeOf("string");

    const second = (
      await ctx.app.inject({ url: `/v1/invites?limit=3&cursor=${first.nextCursor}`, headers: bearer(host.accessToken) })
    ).json();
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const seen = [...first.items, ...second.items].map((i: { code: string }) => i.code);
    expect(seen).toEqual([...codes].reverse());
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

  it("reports exhausted invites in the preview", async () => {
    const host = await signUp("solo");
    const { code } = await createInvite(host.accessToken, { maxUses: 1 });
    await signUp("first", { inviteCode: code });
    const preview = await ctx.app.inject({ url: `/v1/invites/${code}` });
    expect(preview.json().status).toBe("exhausted");
  });

  it("returns INVITE_NOT_FOUND for unknown codes", async () => {
    const res = await ctx.app.inject({ url: "/v1/invites/NOPE2345" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("INVITE_NOT_FOUND");
  });
});
