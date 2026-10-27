import { describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { type Auth, bearer, chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

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

  it("only lets new people in with an invite, except admins", async () => {
    const sub = uniqueSub("gatekeeper");
    const host: Auth = (await loginAs(ctx.app, sub)).json();
    env.INVITE_ONLY = true;
    try {
      const res = await loginAs(ctx.app, uniqueSub("walk-in"));
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("INVITE_REQUIRED");

      expect((await loginAs(ctx.app, "the-admin")).statusCode).toBe(200);
      expect((await loginAs(ctx.app, sub)).statusCode).toBe(200);
      const { code } = await createInvite(host.accessToken);
      expect((await signUp("invited", { inviteCode: code })).accessToken).toBeTypeOf("string");
    } finally {
      env.INVITE_ONLY = false;
    }
  });

  it("queues sign-ups past the inviter's limit until an admin raises it", async () => {
    const boss: Auth = (await loginAs(ctx.app, "the-admin")).json();
    const host = await signUp("popular");
    expect(await get(host, "/v1/me/invite-quota")).toEqual({ limit: 10, invited: 0, waiting: 0 });
    await call(boss, "POST", `/v1/admin/users/${host.user.id}/invite-limit`, { limit: 1 });
    const { code } = await createInvite(host.accessToken, { maxUses: 3 });

    await signUp("first", { inviteCode: code });
    const late = uniqueSub("late");
    const queued = await loginAs(ctx.app, late, "ios", { inviteCode: code });
    expect(queued.statusCode).toBe(403);
    expect(queued.json().error.code).toBe("ACCOUNT_QUEUED");
    expect((await loginAs(ctx.app, late)).json().error.code).toBe("ACCOUNT_QUEUED");
    expect((await call(boss, "POST", "/v1/contacts", { q: `${late}@example.com` })).json().error.code).toBe("USER_NOT_FOUND");

    expect(await get(host, "/v1/me/invite-quota")).toEqual({ limit: 1, invited: 1, waiting: 1 });
    expect((await get(host, "/v1/me/referrals")).items).toHaveLength(1);
    expect(await get(boss, `/v1/admin/users/${host.user.id}`)).toMatchObject({ inviteLimit: 1, invited: 1, waiting: 1 });

    const raised = await call(boss, "POST", `/v1/admin/users/${host.user.id}/invite-limit`, { limit: 2 });
    expect(raised.json()).toMatchObject({ inviteLimit: 2, invited: 2, waiting: 0 });
    const admitted = await loginAs(ctx.app, late);
    expect(admitted.statusCode).toBe(200);
    const contacts = await get(admitted.json(), "/v1/contacts");
    expect(contacts.items.map((c: { user: { id: string } }) => c.user.id)).toContain(host.user.id);

    expect((await get(boss, "/v1/me/invite-quota")).limit).toBeNull();
  });
});
