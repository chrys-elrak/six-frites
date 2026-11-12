import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";
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

  it("opens an account with Facebook, whose email Firebase never verifies, and lets it back in by its Firebase account", async () => {
    const uid = unique("fb-newcomer");
    const email = `${uid}@example.com`;
    const res = await viaFirebase({ uid, providers: ["facebook"], email, emailVerified: false }, { guest: true });
    expect(res.statusCode, res.body).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ firebaseUid: uid, providers: ["facebook"] });
    const again = await viaFirebase({ uid, providers: ["facebook"], email, emailVerified: false });
    expect(again.json().user.id).toBe(res.json().user.id);
  });

  it("opens no account on an unverified email from anything but Facebook, nor on an admin's address", async () => {
    const email = `${unique("squatted")}@example.com`;
    const res = await viaFirebase({ uid: unique("stranger"), providers: ["google"], email, emailVerified: false }, { guest: true });
    expect(res.json().error.code).toBe("EMAIL_REQUIRED");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();

    const admin = await viaFirebase({ uid: unique("stranger"), providers: ["facebook"], email: "the-admin@example.com", emailVerified: false });
    expect(admin.json().error.code).toMatch(/^EMAIL_(REQUIRED|TAKEN)$/);
  });

  it("hands an account opened with Facebook alone to whoever Google vouches for, signing everyone else out of it", async () => {
    const sub = unique("owner");
    const email = `${sub}@example.com`;
    const uid = unique("fb-squatter");
    const squatter = await viaFirebase({ uid, providers: ["facebook"], email, emailVerified: false }, { guest: true });
    expect(squatter.statusCode, squatter.body).toBe(200);
    const id = squatter.json().user.id;

    const owner = await loginAs(ctx.app, sub);
    expect(owner.json().user.id).toBe(id);
    expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ googleSub: sub, firebaseUid: null, providers: ["google"] });
    expect(await prisma.session.count({ where: { userId: id, revokedAt: null } })).toBe(1);
    expect((await viaFirebase({ uid, providers: ["facebook"], email, emailVerified: false })).json().error.code).toBe("EMAIL_TAKEN");
  });

  it("refuses a Facebook token from before Firebase handed its account to the address's owner through Apple", async () => {
    const email = `${unique("owner")}@example.com`;
    const uid = unique("fb-then-apple");
    const facebook = { uid, providers: ["facebook"], email, emailVerified: false };
    const id = (await viaFirebase(facebook, { guest: true })).json().user.id;

    const apple = await viaFirebase({ uid, providers: ["apple"], email, emailVerified: true });
    expect(apple.json().user.id).toBe(id);
    expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ firebaseUid: uid, providers: ["apple"] });
    expect((await viaFirebase(facebook)).json().error.code).toBe("EMAIL_TAKEN");
  });

  it("never counts an account that only signed in with Facebook as an admin, whatever its address", async () => {
    const { isAdmin } = await import("../src/plugins/auth.js");
    expect(isAdmin({ email: "The-Admin@example.com", providers: ["facebook"] })).toBe(false);
    expect(isAdmin({ email: "The-Admin@example.com", providers: ["google"] })).toBe(true);
    expect(isAdmin({ email: "The-Admin@example.com", providers: ["facebook", "apple"] })).toBe(true);
  });

  it("doesn't let an unverified Firebase account claim a Google account by its Google id", async () => {
    const sub = unique("stranger");
    const own = (await loginAs(ctx.app, sub)).json();
    const email = `${unique("victim")}@example.com`;
    const bound = await viaFirebase({ uid: unique("squatted-uid"), googleSub: sub, providers: ["google"], email, emailVerified: false });
    expect(bound.json().error.code).toBe("EMAIL_REQUIRED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: own.user.id } })).firebaseUid).toBeNull();
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

describe("the Firebase token check", () => {
  it("only takes a token from Google, Apple or Facebook, not from another sign-in method of the shared project", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256", use: "sig" };
    vi.stubGlobal("fetch", async () => Response.json({ keys: [jwk] }));
    const { verifyFirebaseIdToken } = await vi.importActual<typeof import("../src/lib/firebase.js")>("../src/lib/firebase.js");
    const token = (provider: string) =>
      new SignJWT({ email: "Someone@Example.com", email_verified: false, firebase: { sign_in_provider: provider, identities: {} } })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer("https://securetoken.google.com/akondro")
        .setAudience("akondro")
        .setSubject("uid")
        .setExpirationTime("5m")
        .sign(privateKey);

    try {
      expect(await verifyFirebaseIdToken(await token("apple.com"))).toMatchObject({ uid: "uid", email: "someone@example.com", emailVerified: false });
      for (const provider of ["password", "anonymous", "phone", "custom", "github.com"]) {
        await expect(verifyFirebaseIdToken(await token(provider))).rejects.toMatchObject({ code: "INVALID_LOGIN_TOKEN" });
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
