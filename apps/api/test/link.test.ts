import { describe, expect, it } from "vitest";
import { bearer, loginAs, useApp } from "./helpers.js";

const ctx = useApp();

describe("signing in a computer with the phone", () => {
  it("waits for the phone, then signs the computer in once, with the sealed backup key", async () => {
    const phone = (await loginAs(ctx.app, "linker", "android")).json();
    const post = (url: string, payload: object, token?: string) =>
      ctx.app.inject({ method: "POST", url, payload, headers: token ? bearer(token) : {} });

    const ticket = (await post("/v1/auth/link", { device: { platform: "web", name: "Chrome on Windows" } })).json();
    const claim = () => post("/v1/auth/link/claim", { id: ticket.id, secret: ticket.secret });
    expect((await claim()).json()).toEqual({ status: "waiting" });

    const wrong = await ctx.app.inject({
      url: `/v1/devices/links/${ticket.id}?secret=nope`,
      headers: bearer(phone.accessToken),
    });
    expect(wrong.json().error.code).toBe("LINK_NOT_FOUND");
    const preview = await ctx.app.inject({
      url: `/v1/devices/links/${ticket.id}?secret=${ticket.secret}`,
      headers: bearer(phone.accessToken),
    });
    expect(preview.json()).toEqual({ platform: "web", deviceName: "Chrome on Windows" });

    const approve = { secret: ticket.secret, sealedKey: "sealed" };
    expect((await post(`/v1/devices/links/${ticket.id}`, approve, phone.accessToken)).statusCode).toBe(204);
    expect((await post(`/v1/devices/links/${ticket.id}`, approve, phone.accessToken)).json().error.code).toBe("LINK_NOT_FOUND");

    const linked = await claim();
    expect(linked.json()).toMatchObject({ status: "linked", sealedKey: "sealed", user: { id: phone.user.id } });
    expect(linked.cookies.find((c) => c.name === "six_rt")?.httpOnly).toBe(true);
    const me = await ctx.app.inject({ url: "/v1/me", headers: bearer(linked.json().accessToken) });
    expect(me.json().id).toBe(phone.user.id);

    expect((await claim()).json().error.code).toBe("LINK_NOT_FOUND");
  });
});
