import { describe, expect, it, vi } from "vitest";
import { formatted, layout, plain } from "../src/mail/templates.js";
import { unsubscribeUrl } from "../src/services/emails.js";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, makeFriends } = chatHelpers(ctx);

describe("pokes", () => {
  it("pokes a contact, with a few words, and not strangers, blocked people or anyone who turned emails off", async () => {
    const { host, guest } = await makeFriends();
    const stranger = await signUp("stranger");
    const poke = (who: typeof host, to: string, body: object = {}) => call(who, "POST", `/v1/users/${to}/poke`, body);

    expect((await poke(host, stranger.user.id)).json().error.code).toBe("CONTACT_NOT_FOUND");
    expect((await poke(host, host.user.id)).json().error.code).toBe("POKE_UNAVAILABLE");
    expect((await poke(host, guest.user.id, { message: "x".repeat(201) })).statusCode).toBe(400);

    const first = await poke(host, guest.user.id, { message: "  Where are you?  " });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ remaining: 9 });
    expect(await prisma.poke.findFirst({ where: { fromId: host.user.id } })).toMatchObject({ toId: guest.user.id, message: "Where are you?" });
    await vi.waitFor(async () =>
      expect(await prisma.mailLog.findFirst({ where: { userId: guest.user.id } })).toMatchObject({
        kind: "poke",
        status: "skipped",
        fromId: host.user.id,
        to: expect.stringContaining("@"),
      }),
    );
    expect((await poke(host, guest.user.id)).json().error.code).toBe("ALREADY_POKED");
    expect((await poke(guest, host.user.id)).statusCode).toBe(200);

    await prisma.poke.deleteMany({ where: { fromId: host.user.id } });
    await prisma.user.update({ where: { id: guest.user.id }, data: { mailOptOut: true } });
    expect((await poke(host, guest.user.id)).json().error.code).toBe("POKE_UNAVAILABLE");
    await prisma.user.update({ where: { id: guest.user.id }, data: { mailOptOut: false } });
    await call(guest, "POST", `/v1/users/${host.user.id}/block`);
    expect((await poke(host, guest.user.id)).json().error.code).toBe("POKE_UNAVAILABLE");
  });

  it("lets the same person be poked 5 times a day, an hour apart", async () => {
    const { host, guest } = await makeFriends();
    const poke = () => call(host, "POST", `/v1/users/${guest.user.id}/poke`, {});
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);
    for (const h of [5, 4, 3, 2]) await prisma.poke.create({ data: { fromId: host.user.id, toId: guest.user.id, createdAt: hoursAgo(h) } });
    await prisma.poke.create({ data: { fromId: host.user.id, toId: guest.user.id, createdAt: hoursAgo(0.5) } });
    expect((await poke()).json().error.code).toBe("POKE_PERSON_LIMIT_REACHED");
    await prisma.poke.deleteMany({ where: { fromId: host.user.id, createdAt: { lt: hoursAgo(4.5) } } });
    expect((await poke()).json().error.code).toBe("ALREADY_POKED");
    await prisma.poke.updateMany({ where: { fromId: host.user.id, createdAt: { gt: hoursAgo(1) } }, data: { createdAt: hoursAgo(1.5) } });
    expect((await poke()).json()).toEqual({ remaining: 5 });
  });

  it("stops at 10 pokes a day", async () => {
    const { host, guest } = await makeFriends();
    const day = Array.from({ length: 10 }, () => ({ fromId: host.user.id, toId: host.user.id }));
    await prisma.poke.createMany({ data: day });
    expect((await call(host, "POST", `/v1/users/${guest.user.id}/poke`, {})).json().error.code).toBe("POKE_LIMIT_REACHED");
    await prisma.poke.updateMany({ where: { fromId: host.user.id }, data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    expect((await call(host, "POST", `/v1/users/${guest.user.id}/poke`, {})).statusCode).toBe(200);
  });
});

describe("account language", () => {
  it("is kept on the account for every device, and only takes a language the apps have", async () => {
    const someone = await signUp("polyglot");
    expect((await get(someone, "/v1/me")).locale).toBeNull();
    expect((await call(someone, "PATCH", "/v1/me", { locale: "de" })).statusCode).toBe(400);
    expect((await call(someone, "PATCH", "/v1/me", { locale: "mg" })).json().locale).toBe("mg");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someone.user.id } })).locale).toBe("mg");
  });
});

describe("unsubscribing", () => {
  it("asks first, then turns emails off only with a valid link", async () => {
    const someone = await signUp("someone");
    const url = new URL(unsubscribeUrl(someone.user.id));
    const path = `${url.pathname}${url.search}`;

    const ask = await ctx.app.inject({ url: path });
    expect(ask.headers["content-type"]).toContain("text/html");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someone.user.id } })).mailOptOut).toBe(false);

    await ctx.app.inject({ method: "POST", url: path.replace(/t=[^&]+/, "t=forged"), headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someone.user.id } })).mailOptOut).toBe(false);

    const done = await ctx.app.inject({
      method: "POST",
      url: path,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(done.statusCode).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someone.user.id } })).mailOptOut).toBe(true);
  });
});

describe("email templates", () => {
  it("escapes what people write and keeps a plain-text copy", () => {
    const m = {
      assets: "https://six-frites.koera.mg",
      lang: "en",
      preheader: "hi",
      badge: { name: "<b>Eve</b>" },
      title: "Eve poked you!",
      paragraphs: ["Come say hi"],
      quote: { label: "Eve says:", text: `<script>alert("x")</script>` },
      cta: { label: "Open the chat", href: "https://six-frites.koera.mg/chats/1" },
      why: "Because",
      unsubscribe: { prompt: "Stop?", label: "Unsubscribe", href: "https://x/unsub?u=1&t=2" },
    };
    const html = layout(m);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).toContain("icon-192.png");
    expect(plain(m)).toContain(`"<script>alert("x")</script>"`);
    expect(plain(m)).toContain("Open the chat: https://six-frites.koera.mg/chats/1");
  });

  it("turns a message's styles into email HTML, nesting overlaps and escaping the text", () => {
    const html = formatted("big <news> today", [
      { type: "bold", offset: 0, length: 10 },
      { type: "italic", offset: 4, length: 12 },
      { type: "color", offset: 0, length: 3, value: "red" },
    ]);
    expect(html).toBe("<strong>big</strong><strong> </strong><em><strong>&#60;news&#62;</strong></em><em> today</em>");
    const hidden = formatted("answer:\nforty two!", [
      { type: "spoiler", offset: 8, length: 9 },
      { type: "bold", offset: 14, length: 4 },
    ]);
    expect(hidden).toBe("answer:<br>••••<strong>!</strong>");
  });
});
