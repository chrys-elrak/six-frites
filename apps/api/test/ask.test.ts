import type { AddressInfo } from "node:net";
import { io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { SEND_LIMITS } from "../src/services/ask.js";
import { createSocketServer } from "../src/socket/index.js";
import { type Auth, chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, signUp } = chatHelpers(ctx);

const walkIn = async (name: string): Promise<Auth & { user: { askCode: string } }> =>
  (await loginAs(ctx.app, uniqueSub(name), "web", { guest: true })).json();
const ask = (who: Auth, code: string, text: string) => call(who, "POST", `/v1/ask/${code}`, { text });
const inbox = async (who: Auth) => (await get(who, "/v1/ask")).items as { id: string; text: string }[];

beforeAll(() => void (env.INVITE_ONLY = true));
afterAll(() => void (env.INVITE_ONLY = false));

describe("anonymous messages", () => {
  it("lets anyone signed in, guests too, write to a link without the recipient learning who", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const code = owner.user.askCode;

    const profile = (await ctx.app.inject({ url: `/v1/ask/${code.toLowerCase()}` })).json();
    expect(profile.displayName).toBeTruthy();
    expect((await ctx.app.inject({ url: "/v1/ask/NOPE" })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "POST", url: `/v1/ask/${code}`, payload: { text: "hi" } })).statusCode).toBe(401);

    expect((await ask(fan, code, "  Who's your crush? 👀  ")).statusCode).toBe(204);
    expect((await ask(fan, code, " ")).statusCode).toBe(400);
    const [got] = await inbox(owner);
    expect(got).toEqual({ id: expect.any(String), text: "Who's your crush? 👀", createdAt: expect.any(String) });
    expect(JSON.stringify(got)).not.toContain(fan.user.id);
    expect(await inbox(fan)).toEqual([]);
  });

  it("only lets the recipient delete, block or report, and quietly drops what a blocked sender writes", async () => {
    const owner = await walkIn("owner");
    const troll = await walkIn("troll");
    const stranger = await walkIn("stranger");
    const code = owner.user.askCode;
    await ask(troll, code, "first");
    await ask(troll, code, "second");
    const [second, first] = await inbox(owner);

    expect((await call(stranger, "POST", `/v1/ask/messages/${first!.id}/block`)).statusCode).toBe(404);
    expect((await call(stranger, "POST", "/v1/reports", { anonMessageId: first!.id, reason: "spam" })).statusCode).toBe(404);
    await call(stranger, "DELETE", `/v1/ask/messages/${first!.id}`);
    expect(await inbox(owner)).toHaveLength(2);

    expect((await call(owner, "POST", "/v1/reports", { anonMessageId: first!.id, reason: "harassment" })).statusCode).toBe(204);
    expect((await call(owner, "DELETE", `/v1/ask/messages/${second!.id}`)).statusCode).toBe(204);
    expect((await call(owner, "POST", `/v1/ask/messages/${first!.id}/block`)).statusCode).toBe(204);
    expect(await inbox(owner)).toEqual([]);

    expect((await ask(troll, code, "you can't stop me")).statusCode).toBe(204);
    expect((await ask(stranger, code, "hello")).statusCode).toBe(204);
    expect((await inbox(owner)).map((m) => m.text)).toEqual(["hello"]);

    const boss: Auth = (await loginAs(ctx.app, "the-admin")).json();
    const reports = (await get(boss, "/v1/admin/reports?status=open")).items;
    const report = reports.find((r: { messages: { id: string }[] }) => r.messages[0]?.id === first!.id);
    expect(report.target.id).toBe(troll.user.id);
    expect(report.messages[0].text).toBe("first");
  });

  it("shows a public name and photo of the user's choosing, and swaps the link for a new one", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const profile = async (code: string) => (await ctx.app.inject({ url: `/v1/ask/${code}` })).json();
    const account = await get(owner, "/v1/me");

    expect(await profile(owner.user.askCode)).toEqual({ displayName: account.displayName, avatarUrl: null });

    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const updated = (await call(owner, "PATCH", "/v1/ask/profile", { name: "  Mystery Fry ", photo: pixel })).json();
    expect(updated.displayName).toBe("Mystery Fry");
    expect(updated.avatarUrl).toEqual(expect.any(String));
    expect((await get(owner, "/v1/me")).displayName).toBe(account.displayName);
    expect((await call(owner, "PATCH", "/v1/ask/profile", { name: "", photo: null })).json()).toEqual({
      displayName: account.displayName,
      avatarUrl: null,
    });

    const renewed = (await call(owner, "POST", "/v1/ask/code")).json();
    expect(renewed.askCode).not.toBe(owner.user.askCode);
    expect((await ctx.app.inject({ url: `/v1/ask/${owner.user.askCode}` })).statusCode).toBe(404);
    expect((await ask(fan, owner.user.askCode, "still there?")).statusCode).toBe(404);
    expect((await ask(fan, renewed.askCode, "found you")).statusCode).toBe(204);
  });

  it("turns away links, empty-looking text, repeats and floods", async () => {
    const owner = await walkIn("owner");
    const spammer = await walkIn("spammer");
    const code = owner.user.askCode;
    const code400 = async (text: string) => (await ask(spammer, code, text)).statusCode;

    for (const text of ["win at https://scam.example", "go to www.scam.example", "bit.ly/free", "\u200b\u200b\u200b", "..."]) {
      expect(await code400(text)).toBe(400);
    }
    expect((await call(owner, "PATCH", "/v1/ask/profile", { name: "Mango fan 🥭" })).statusCode).toBe(200);
    expect((await call(owner, "PATCH", "/v1/ask/profile", { name: "Promo bit.ly/x" })).statusCode).toBe(400);

    expect(await code400("Do you like mangoes? 🥭")).toBe(204);
    expect((await ask(spammer, code, "do you like MANGOES? 🥭")).json().error.code).toBe("CONFLICT");
    for (let i = 1; i < SEND_LIMITS.perRecipient; i++) expect(await code400(`question ${i}`)).toBe(204);
    expect((await ask(spammer, code, "one more")).json().error.code).toBe("RATE_LIMITED");
    expect((await inbox(owner)).length).toBe(SEND_LIMITS.perRecipient);
  });

  it("tells the recipient's open apps right away", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    createSocketServer(ctx.app.server);
    await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const socket = connect(url, { auth: { token: owner.accessToken }, transports: ["websocket"], forceNew: true });
    try {
      await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
      const arrived = new Promise((resolve) => socket.once("ask:new", resolve));
      await ask(fan, owner.user.askCode, "live?");
      const m = await arrived;
      expect(m).toEqual({ id: expect.any(String), text: "live?", createdAt: expect.any(String) });
    } finally {
      socket.disconnect();
    }
  });

  it("gives members their link too", async () => {
    env.INVITE_ONLY = false;
    const member = await signUp("member");
    env.INVITE_ONLY = true;
    const me = await get(member, "/v1/me");
    expect(me.guest).toBe(false);
    expect((await ctx.app.inject({ url: `/v1/ask/${me.askCode}` })).statusCode).toBe(200);
  });
});
