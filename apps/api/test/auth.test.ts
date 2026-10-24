import { describe, expect, it } from "vitest";
import { bearer, loginAs, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const login = (sub: string, platform = "ios", extra: Record<string, unknown> = {}) =>
  loginAs(ctx.app, sub, platform, extra);

describe("auth", () => {
  it("creates the user and returns tokens for native clients", async () => {
    const res = await login("alice");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.refreshToken).toBeTypeOf("string");

    const me = await ctx.app.inject({ url: "/v1/me", headers: bearer(body.accessToken) });
    expect(me.json().id).toBe(body.user.id);
  });

  it("sets an httpOnly cookie instead of returning the refresh token on web", async () => {
    const res = await login("bob", "web");
    expect(res.json().refreshToken).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === "six_rt");
    expect(cookie?.httpOnly).toBe(true);

    const refreshed = await ctx.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      cookies: { six_rt: cookie!.value },
    });
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    expect(refreshed.cookies.find((c) => c.name === "six_rt")?.value).not.toBe(cookie!.value);
  });

  it("rejects a bad Google token with the standard error shape", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken: "garbage", device: { platform: "ios" } },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_GOOGLE_TOKEN" } });
  });

  it("returns VALIDATION_FAILED for malformed bodies", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/v1/auth/google", payload: { device: {} } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("rotates refresh tokens and revokes the session when an old one is reused", async () => {
    const first = (await login("carol")).json();
    const refresh = (token: string) =>
      ctx.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: token } });

    const second = await refresh(first.refreshToken);
    expect(second.statusCode).toBe(200);
    const rotated = second.json();
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    const replay = await refresh(first.refreshToken);
    expect(replay.json().error.code).toBe("REFRESH_TOKEN_REUSED");

    const afterTheft = await refresh(rotated.refreshToken);
    expect(afterTheft.json().error.code).toBe("SESSION_REVOKED");

    const me = await ctx.app.inject({ url: "/v1/me", headers: bearer(rotated.accessToken) });
    expect(me.json().error.code).toBe("SESSION_REVOKED");
  });

  it("logout revokes the current session", async () => {
    const { accessToken } = (await login("dave")).json();
    const out = await ctx.app.inject({ method: "POST", url: "/v1/auth/logout", headers: bearer(accessToken) });
    expect(out.statusCode).toBe(204);
    const me = await ctx.app.inject({ url: "/v1/me", headers: bearer(accessToken) });
    expect(me.statusCode).toBe(401);
  });
});

describe("sessions", () => {
  it("lists devices and logs out the others", async () => {
    const a = (await login("erin", "ios")).json();
    const b = (await login("erin", "web")).json();

    const list = await ctx.app.inject({ url: "/v1/sessions", headers: bearer(a.accessToken) });
    const items = list.json().items;
    expect(items).toHaveLength(2);
    expect(items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const del = await ctx.app.inject({ method: "DELETE", url: "/v1/sessions", headers: bearer(a.accessToken) });
    expect(del.json().revoked).toBe(1);

    const meB = await ctx.app.inject({ url: "/v1/me", headers: bearer(b.accessToken) });
    expect(meB.statusCode).toBe(401);
  });

  it("cannot revoke someone else's session", async () => {
    const x = (await login("frank")).json();
    const y = (await login("grace")).json();
    const ySessions = await ctx.app.inject({ url: "/v1/sessions", headers: bearer(y.accessToken) });
    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/v1/sessions/${ySessions.json().items[0].id}`,
      headers: bearer(x.accessToken),
    });
    expect(res.json().error.code).toBe("SESSION_NOT_FOUND");
  });
});

describe("referrals at signup", () => {
  it("applies an invite code for new users only, respecting maxUses", async () => {
    const host = (await login("heidi")).json();
    await prisma.invite.create({ data: { code: "HEIDI1", creatorId: host.user.id, maxUses: 1 } });

    const ivan = await login("ivan", "ios", { inviteCode: "HEIDI1" });
    expect(ivan.statusCode).toBe(200);
    const referral = await prisma.referral.findUnique({ where: { refereeId: ivan.json().user.id } });
    expect(referral?.referrerId).toBe(host.user.id);

    const judy = await login("judy", "ios", { inviteCode: "HEIDI1" });
    expect(judy.json().error.code).toBe("INVITE_EXHAUSTED");
    expect(await prisma.user.findUnique({ where: { googleSub: "judy" } })).toBeNull();
  });
});

describe("contract", () => {
  it("serves OpenAPI with versioned routes and a JSON 404", async () => {
    const spec = (await ctx.app.inject({ url: "/docs/json" })).json();
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/v1/auth/google", "/v1/auth/refresh", "/v1/me", "/v1/sessions"]),
    );
    const missing = await ctx.app.inject({ url: "/v1/nope" });
    expect(missing.json().error.code).toBe("NOT_FOUND");
  });
});
