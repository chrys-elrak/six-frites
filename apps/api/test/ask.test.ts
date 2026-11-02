import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { BOT_LINES } from "../src/lib/bot-lines.js";
import { SEND_LIMITS, nextBotAt, sendDueBotAnon } from "../src/services/ask.js";
import { createSocketServer } from "../src/socket/index.js";
import { TEMP_LINK_MAX } from "@six/shared";
import { type Auth, asAdmin, chatHelpers, loginAs, prisma, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, signUp } = chatHelpers(ctx);

const walkIn = async (name: string, extra: Record<string, unknown> = {}): Promise<Auth & { user: { askCode: string } }> =>
  (await loginAs(ctx.app, uniqueSub(name), "web", { guest: true, ...extra })).json();
const ask = (who: Auth, code: string, text: string) => call(who, "POST", `/v1/ask/${code}`, { text });
const inbox = async (who: Auth) =>
  (await get(who, "/v1/ask")).items as { id: string; text: string; prompt: string | null; photoUrl: string | null; oldLink: boolean }[];

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
      bot: false,
      prompt: null,
    });
    expect(JSON.stringify(got)).not.toContain(fan.user.id);
    expect(await inbox(fan)).toEqual([]);
  });

  it("only lets the recipient delete, block or report, and tells a blocked sender, on every account on their devices", async () => {
    const owner = await walkIn("owner");
    const browser = { device: { platform: "web", name: "Chrome", id: `browser-${uniqueSub("block")}` } };
    const troll = await walkIn("troll", browser);
    const trollAgain = await walkIn("troll-again", browser);
    const stranger = await walkIn("stranger");
    const code = owner.user.askCode;
    const link = async (who: Auth) => (await get(who, `/v1/ask/${code}`)).blocked;
    await ask(troll, code, "first");
    await ask(troll, code, "second");
    const [second, first] = await inbox(owner);

    expect((await call(stranger, "POST", `/v1/ask/messages/${first!.id}/block`)).statusCode).toBe(404);
    expect((await call(stranger, "POST", "/v1/reports", { anonMessageId: first!.id, reason: "spam" })).statusCode).toBe(404);
    await call(stranger, "DELETE", `/v1/ask/messages/${first!.id}`);
    expect(await inbox(owner)).toHaveLength(2);

    expect((await call(owner, "POST", "/v1/reports", { anonMessageId: first!.id, reason: "harassment" })).statusCode).toBe(204);
    expect((await call(owner, "DELETE", `/v1/ask/messages/${second!.id}`)).statusCode).toBe(204);
    expect(await link(troll)).toBe(false);
    expect((await call(owner, "POST", `/v1/ask/messages/${first!.id}/block`)).statusCode).toBe(204);
    expect(await inbox(owner)).toEqual([]);

    expect((await ask(troll, code, "you can't stop me")).json().error.code).toBe("ANON_BLOCKED");
    expect((await ask(trollAgain, code, "new account, who dis")).json().error.code).toBe("ANON_BLOCKED");
    expect([await link(troll), await link(trollAgain), await link(stranger)]).toEqual([true, true, false]);
    expect((await ctx.app.inject({ url: `/v1/ask/${code}` })).json().blocked).toBe(false);
    expect((await ask(stranger, code, "hello")).statusCode).toBe(204);
    expect((await inbox(owner)).map((m) => m.text)).toEqual(["hello"]);

    const boss = await asAdmin(ctx.app);
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

    expect(await profile(owner.user.askCode)).toEqual({ displayName: account.displayName, avatarUrl: null, prompt: null, blocked: false });

    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const updated = (await call(owner, "PATCH", "/v1/ask/profile", { name: "  Mystery Fry ", photo: pixel })).json();
    expect(updated.displayName).toBe("Mystery Fry");
    expect(updated.avatarUrl).toEqual(expect.any(String));
    expect((await get(owner, "/v1/me")).displayName).toBe(account.displayName);
    expect((await call(owner, "PATCH", "/v1/ask/profile", { name: "", photo: null })).json()).toEqual({
      displayName: account.displayName,
      avatarUrl: null,
      prompt: null,
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

  it("lets the owner write the prompt on their link, and keeps the one each message answered", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const code = owner.user.askCode;
    const prompt = async (value: string) => call(owner, "PATCH", "/v1/ask/profile", { prompt: value });
    const link = async () => (await ctx.app.inject({ url: `/v1/ask/${code}` })).json().prompt;

    expect((await prompt("x".repeat(61))).statusCode).toBe(400);
    expect((await prompt("Ask me on six-frites.koera.mg/ask/ABC")).statusCode).toBe(400);
    expect((await prompt("  Tell me a secret 🤫 ")).json().prompt).toBe("Tell me a secret 🤫");
    expect(await link()).toBe("Tell me a secret 🤫");
    await ask(fan, code, "I like your hair");

    await prompt("Rate my outfit");
    await ask(fan, code, "10/10");
    expect((await inbox(owner)).map((m) => [m.text, m.prompt])).toEqual([
      ["10/10", "Rate my outfit"],
      ["I like your hair", "Tell me a secret 🤫"],
    ]);
    expect((await get(fan, "/v1/ask/sent")).items[0].prompt).toBe("Rate my outfit");

    expect((await prompt("")).json().prompt).toBeNull();
    expect(await link()).toBeNull();
  });

  it("makes temporary links that expire while the user's own link stays", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const page = async (code: string) => (await ctx.app.inject({ url: `/v1/ask/${code}` })).statusCode;

    expect((await call(owner, "POST", "/v1/ask/links", { prompt: "Story time", hours: 5 })).statusCode).toBe(400);
    expect((await call(owner, "POST", "/v1/ask/links", { prompt: "  ", hours: 24 })).statusCode).toBe(400);
    expect((await call(owner, "POST", "/v1/ask/links", { prompt: "See bit.ly/x", hours: 24 })).statusCode).toBe(400);
    await call(owner, "PATCH", "/v1/ask/profile", { prompt: "My usual prompt" });
    const temp = (await call(owner, "POST", "/v1/ask/links", { prompt: " Rate my holiday pics 🏖️ ", hours: 24 })).json();
    expect(temp.prompt).toBe("Rate my holiday pics 🏖️");
    expect(Date.parse(temp.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
    expect(await get(owner, "/v1/ask/links")).toEqual([temp]);
    expect((await ctx.app.inject({ url: `/v1/ask/${temp.code}` })).json().prompt).toBe("Rate my holiday pics 🏖️");
    expect((await ctx.app.inject({ url: `/v1/ask/${owner.user.askCode}` })).json().prompt).toBe("My usual prompt");
    expect((await ask(fan, temp.code.toLowerCase(), "from your story")).statusCode).toBe(204);
    expect((await inbox(owner)).map((m) => [m.text, m.prompt, m.oldLink])).toEqual([["from your story", "Rate my holiday pics 🏖️", false]]);

    const renewed = (await call(owner, "POST", "/v1/ask/code")).json();
    expect(await page(temp.code)).toBe(200);
    expect(await page(renewed.askCode)).toBe(200);

    await prisma.askLink.update({ where: { code: temp.code }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await page(temp.code)).toBe(404);
    expect((await ask(fan, temp.code, "too late")).statusCode).toBe(404);
    expect(await get(owner, "/v1/ask/links")).toEqual([]);

    const next = (await call(owner, "POST", "/v1/ask/links", { prompt: "A week of questions", hours: 168 })).json();
    expect((await call(fan, "DELETE", `/v1/ask/links/${next.code}`)).statusCode).toBe(204);
    expect(await page(next.code)).toBe(200);
    expect((await call(owner, "DELETE", `/v1/ask/links/${next.code}`)).statusCode).toBe(204);
    expect(await page(next.code)).toBe(404);

    for (let i = 0; i < TEMP_LINK_MAX; i++) await call(owner, "POST", "/v1/ask/links", { prompt: "Ask me anything", hours: 72 });
    expect((await call(owner, "POST", "/v1/ask/links", { prompt: "Ask me anything", hours: 72 })).json().error.code).toBe("CONFLICT");
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

  it("stops one longer text pasted to link after link, but not a short greeting", async () => {
    const sender = await walkIn("paster");
    const pasted = "Win a free phone, write back to find out how!";
    for (let i = 0; i < SEND_LIMITS.sameText; i++) {
      expect((await ask(sender, (await walkIn(`target-${i}`)).user.askCode, pasted)).statusCode).toBe(204);
    }
    const next = (await walkIn("target-next")).user.askCode;
    expect((await ask(sender, next, pasted.toUpperCase())).json().error.code).toBe("CONFLICT");
    expect((await ask(sender, next, "Hi! 👋")).statusCode).toBe(204);
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

  it("turns away links, Six Frites' own too, takes real photos, and shows a reported photo to the moderators", async () => {
    const owner = await walkIn("owner");
    const fan = await walkIn("fan");
    const code = owner.user.askCode;
    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const send = (body: object) => call(fan, "POST", `/v1/ask/${code}`, body);

    for (const text of ["look at https://example.com", "www.promo.net", "bit.ly/x", "six-frites.koera.mg/ask/ABC12345"]) {
      expect((await send({ text })).statusCode).toBe(400);
    }
    expect((await send({ photo: "data:image/png;base64,PGh0bWw+PC9odG1sPg==" })).statusCode).toBe(400);
    expect((await send({ photo: pixel })).statusCode).toBe(204);
    const [photo] = await inbox(owner);
    expect(photo).toMatchObject({ text: "", photoUrl: expect.any(String) });

    expect((await call(owner, "POST", "/v1/reports", { anonMessageId: photo!.id, reason: "sexual" })).statusCode).toBe(204);
    await call(owner, "DELETE", `/v1/ask/messages/${photo!.id}`);
    const boss = await asAdmin(ctx.app);
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

    const boss = await asAdmin(ctx.app);
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
      expect(m).toEqual({ id: expect.any(String), text: "live?", entities: [], photoUrl: null, gif: null, voice: null, createdAt: expect.any(String), oldLink: false, bot: false, prompt: null });
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

describe("the Six Frites bot", () => {
  it("has every line in every language, each once", () => {
    for (const lines of Object.values(BOT_LINES)) {
      expect(lines).toHaveLength(BOT_LINES.en.length);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it("writes again 2 to 6 days later, never at night in Madagascar", () => {
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      const at = nextBotAt(now).getTime();
      expect(at - now).toBeGreaterThanOrEqual(2 * 86_400_000);
      expect(at - now).toBeLessThan(6 * 86_400_000 + 10 * 3_600_000);
      const hour = new Date(at + 3 * 3_600_000).getUTCHours();
      expect(hour >= 8 && hour < 22).toBe(true);
    }
  });

  it("sends each line once, marked as the bot's, which can't be reported or blocked, until turned off", async () => {
    const owner = await walkIn("owner");
    const due = () => prisma.user.update({ where: { id: owner.user.id }, data: { anonBotAt: new Date(Date.now() - 1000) } });
    for (const _ of [...BOT_LINES.en, "one too many"]) {
      await due();
      await sendDueBotAnon();
    }
    const got = (await get(owner, "/v1/ask?limit=100")).items as { id: string; text: string; bot: boolean }[];
    expect(new Set(got.map((m) => m.text))).toEqual(new Set(BOT_LINES.en));
    expect(got.every((m) => m.bot)).toBe(true);
    expect((await call(owner, "POST", "/v1/reports", { anonMessageId: got[0]!.id, reason: "spam" })).statusCode).toBe(400);
    expect((await call(owner, "POST", `/v1/ask/messages/${got[0]!.id}/block`)).statusCode).toBe(400);

    const other = await walkIn("other");
    expect((await get(other, "/v1/me")).anonBot).toBe(true);
    const off = await call(other, "PUT", "/v1/ask/bot", { on: false });
    expect(off.json().anonBot).toBe(false);
    await prisma.user.update({ where: { id: other.user.id }, data: { anonBotAt: new Date(Date.now() - 1000) } });
    await sendDueBotAnon();
    expect(await inbox(other)).toEqual([]);
  });
});
