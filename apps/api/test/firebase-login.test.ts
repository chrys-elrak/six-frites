import { describe, expect, it } from "vitest";
import { loginAs, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const viaFirebase = (claims: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ctx.app.inject({
    method: "POST",
    url: "/v1/auth/firebase",
    payload: { idToken: `firebase:${JSON.stringify(claims)}`, device: { platform: "android", name: "Test" }, ...extra },
  });
const unique = (name: string) => `${name}-${Math.random().toString(36).slice(2, 8)}`;

describe("signing in through Firebase", () => {
  it("keeps the account of someone who joined with Google, and remembers their Firebase account", async () => {
    const sub = unique("google-first");
    const before = (await loginAs(ctx.app, sub)).json();
    const uid = unique("uid");
    const res = await viaFirebase({ uid, googleSub: sub, providers: ["google", "facebook"], email: `${sub}@example.com` });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(before.user.id);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: before.user.id } })).toMatchObject({
      firebaseUid: uid,
      providers: ["google", "facebook"],
    });
    expect((await viaFirebase({ uid, email: `${sub}@example.com` })).json().user.id).toBe(before.user.id);
    expect((await loginAs(ctx.app, sub)).json().user.id).toBe(before.user.id);
  });

  it("signs someone in with Apple into the account their verified email already has", async () => {
    const sub = unique("apple-later");
    const before = (await loginAs(ctx.app, sub)).json();
    const res = await viaFirebase({ uid: unique("apple"), email: `${sub}@example.com`, emailVerified: true });
    expect(res.json().user.id).toBe(before.user.id);
  });

  it("refuses an unverified email that already has an account, and an account with no email", async () => {
    const sub = unique("taken");
    await loginAs(ctx.app, sub);
    const taken = await viaFirebase({ uid: unique("fb"), email: `${sub}@example.com`, emailVerified: false });
    expect(taken.json().error.code).toBe("EMAIL_TAKEN");
    expect((await viaFirebase({ uid: unique("fb") })).json().error.code).toBe("EMAIL_REQUIRED");
  });

  it("creates a new account for a newcomer, as invite-only and guest rules allow", async () => {
    const uid = unique("newcomer");
    const res = await viaFirebase({ uid, email: `${uid}@example.com`, name: "New Comer" }, { guest: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ displayName: "New Comer", email: `${uid}@example.com` });
    expect((await prisma.user.findUniqueOrThrow({ where: { firebaseUid: uid } })).googleSub).toBeNull();
  });

  it("rejects a bad token", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/auth/firebase",
      payload: { idToken: "nope", device: { platform: "web" } },
    });
    expect(res.json().error.code).toBe("INVALID_LOGIN_TOKEN");
  });
});

describe("hidden Apple emails", () => {
  it("deletes an account behind one after a week away, and leaves the others", async () => {
    const { deleteIdleHiddenAppleAccounts } = await import("../src/services/users.js");
    const week = 8 * 24 * 60 * 60 * 1000;
    const signUp = async (email: string) =>
      (await viaFirebase({ uid: unique("apple"), email }, { guest: true })).json().user.id as string;
    const idle = await signUp(`${unique("idle")}@privaterelay.appleid.com`);
    const recent = await signUp(`${unique("recent")}@privaterelay.appleid.com`);
    const shared = await signUp(`${unique("shared")}@example.com`);
    await prisma.user.updateMany({ where: { id: { in: [idle, shared] } }, data: { lastSeenAt: new Date(Date.now() - week) } });

    expect(await deleteIdleHiddenAppleAccounts()).toBeGreaterThanOrEqual(1);
    const left = await prisma.user.findMany({ where: { id: { in: [idle, recent, shared] } }, select: { id: true, deletedAt: true } });
    const gone = Object.fromEntries(left.map((u) => [u.id, u.deletedAt !== null]));
    expect(gone).toEqual({ [idle]: true, [recent]: false, [shared]: false });
  });
});
