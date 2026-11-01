import { execFileSync } from "node:child_process";
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
const inbox = async (who: Auth) => (await get(who, "/v1/ask")).items as { id: string; text: string; photoUrl: string | null; oldLink: boolean }[];

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
    expect(got).toEqual({
      id: expect.any(String),
      text: "Who's your crush? 👀",
      entities: [],
      photoUrl: null,
      gif: null,
      voice: null,
      createdAt: expect.any(String),
      oldLink: false,
    });
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
    expect((await get(troll, "/v1/ask/sent")).items[0].text).toBe("you can't stop me");

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

    expect((await ask(fan, owner.user.askCode, "before the change")).statusCode).toBe(204);
    const renewed = (await call(owner, "POST", "/v1/ask/code")).json();
    expect(renewed.askCode).not.toBe(owner.user.askCode);
    expect((await ctx.app.inject({ url: `/v1/ask/${owner.user.askCode}` })).statusCode).toBe(404);
    expect((await ask(fan, owner.user.askCode, "still there?")).statusCode).toBe(404);
    expect((await ask(fan, renewed.askCode, "found you")).statusCode).toBe(204);
    expect((await inbox(owner)).map((m) => [m.text, m.oldLink])).toEqual([
      ["found you", false],
      ["before the change", true],
    ]);
  });

  it("turns away empty-looking text, links in names, repeats and floods", async () => {
    const owner = await walkIn("owner");
    const spammer = await walkIn("spammer");
    const code = owner.user.askCode;
    const status = async (text: string) => (await ask(spammer, code, text)).statusCode;

    for (const text of ["", "\u200b\u200b\u200b", "..."]) expect(await status(text)).toBe(400);
    expect((await call(owner, "PATCH", "/v1/ask/profile", { name: "Mango fan 🥭" })).statusCode).toBe(200);
    expect((await call(owner, "PATCH", "/v1/ask/profile", { name: "Promo bit.ly/x" })).statusCode).toBe(400);

    expect(await status("Do you like mangoes? 🥭")).toBe(204);
    expect((await ask(spammer, code, "do you like MANGOES? 🥭")).json().error.code).toBe("CONFLICT");
    for (let i = 1; i < SEND_LIMITS.perRecipient; i++) expect(await status(`question ${i}`)).toBe(204);
    expect((await ask(spammer, code, "one more")).json().error.code).toBe("RATE_LIMITED");
    expect((await inbox(owner)).length).toBe(SEND_LIMITS.perRecipient);
  });

  it("keeps the formatting, and turns away ranges outside the text", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const send = (body: object) => call(fan, "POST", `/v1/ask/${owner.user.askCode}`, body);
    const entities = [
      { type: "bold", offset: 0, length: 3 },
      { type: "spoiler", offset: 7, length: 8 },
    ];

    expect((await send({ text: "Who is my crush", entities })).statusCode).toBe(204);
    expect((await send({ text: "hey", entities: [{ type: "bold", offset: 1, length: 5 }] })).statusCode).toBe(400);
    expect(await inbox(owner)).toMatchObject([{ text: "Who is my crush", entities }]);
  });

  it("takes links and real photos, and shows a reported photo to the moderators", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const code = owner.user.askCode;
    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const send = (body: object) => call(fan, "POST", `/v1/ask/${code}`, body);

    expect((await send({ text: "look at https://example.com" })).statusCode).toBe(204);
    expect((await send({ photo: "data:image/png;base64,PGh0bWw+PC9odG1sPg==" })).statusCode).toBe(400);
    expect((await send({ photo: pixel })).statusCode).toBe(204);
    const [photo, link] = await inbox(owner);
    expect(photo).toMatchObject({ text: "", photoUrl: expect.any(String) });
    expect(link).toMatchObject({ text: "look at https://example.com", photoUrl: null });

    expect((await call(owner, "POST", "/v1/reports", { anonMessageId: photo!.id, reason: "sexual" })).statusCode).toBe(204);
    await call(owner, "DELETE", `/v1/ask/messages/${photo!.id}`);
    const boss: Auth = (await loginAs(ctx.app, "the-admin")).json();
    const reports = (await get(boss, "/v1/admin/reports?status=open")).items;
    const report = reports.find((r: { messages: { id: string }[] }) => r.messages[0]?.id === photo!.id);
    expect(report.messages[0].attachment).toMatchObject({ kind: "image", url: expect.any(String) });
  });

  it("lists what you sent, lets each side hide a message, and keeps everything for the moderators", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    await call(owner, "PATCH", "/v1/ask/profile", { name: "Secret Fry" });
    await ask(fan, owner.user.askCode, "hi there");
    const sent = async () => (await get(fan, "/v1/ask/sent")).items;

    const [mine] = await sent();
    expect(mine).toMatchObject({ text: "hi there", to: { displayName: "Secret Fry" } });
    expect(JSON.stringify(mine)).not.toContain(owner.user.id);
    expect((await get(owner, "/v1/ask/sent")).items).toEqual([]);

    await call(owner, "DELETE", `/v1/ask/messages/${mine.id}`);
    expect(await inbox(owner)).toEqual([]);
    expect(await sent()).toHaveLength(1);
    expect((await call(owner, "DELETE", `/v1/ask/sent/${mine.id}`)).statusCode).toBe(204);
    expect(await sent()).toHaveLength(1);
    await call(fan, "DELETE", `/v1/ask/sent/${mine.id}`);
    expect(await sent()).toEqual([]);

    const boss: Auth = (await loginAs(ctx.app, "the-admin")).json();
    const { email } = await get(fan, "/v1/me");
    expect((await call(fan, "POST", "/v1/reports", { anonMessageId: mine.id, reason: "spam" })).statusCode).toBe(404);
    expect((await get(owner, `/v1/admin/anon?q=${email}`)).error.code).toBe("FORBIDDEN");
    const [seen] = (await get(boss, `/v1/admin/anon?q=${encodeURIComponent(email)}`)).items;
    expect(seen).toMatchObject({
      id: mine.id,
      text: "hi there",
      sender: { id: fan.user.id },
      recipient: { id: owner.user.id },
      senderDeletedAt: expect.any(String),
      recipientDeletedAt: expect.any(String),
    });
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
      expect(m).toEqual({ id: expect.any(String), text: "live?", entities: [], photoUrl: null, gif: null, voice: null, createdAt: expect.any(String), oldLink: false });
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

const hasFfmpeg = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("anonymous voice messages", () => {
  it("keeps the first minute as AAC, under the recipient, with a waveform", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const clip = execFileSync("ffmpeg", [
      ...["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=70"],
      ...["-c:a", "libopus", "-b:a", "16k", "-metadata", "title=Secret Name", "-f", "webm", "pipe:1"],
    ]);
    const voice = `data:audio/webm;base64,${clip.toString("base64")}`;
    const send = (body: object) => call(fan, "POST", `/v1/ask/${owner.user.askCode}`, body);
    expect((await send({ voice: "data:audio/webm;base64,AAAA" })).statusCode).toBe(400);
    expect((await send({ voice, gifId: "cat1" })).statusCode).toBe(400);
    expect((await send({ voice })).statusCode).toBe(204);

    const [m] = (await get(owner, "/v1/ask")).items;
    expect(m.voice.durationMs).toBeGreaterThan(59_000);
    expect(m.voice.durationMs).toBeLessThanOrEqual(60_000);
    expect(m.voice.waveform).toHaveLength(64);
    expect(m.voice.url).toContain(owner.user.id);
    const file = Buffer.from(await (await fetch(m.voice.url)).arrayBuffer());
    expect(file.toString("latin1")).not.toContain("Secret Name");
  });
});
