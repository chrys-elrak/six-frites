import { FRITE_BOT_ID, SIX_FRITES_ID } from "@six/shared";
import { describe, expect, it, vi } from "vitest";
import { createRoom, endRoom } from "../src/services/live.js";
import { asAdmin, chatHelpers, loginAs, prisma, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call } = chatHelpers(ctx);

describe("Six Frites Game", () => {
  it("has a chat with everyone, starts games there, takes its turns and can be hidden", async () => {
    const me = (await loginAs(ctx.app, uniqueSub("player"))).json();
    const opened = await call(me, "POST", "/v1/bot", { locale: "fr", open: false });
    expect(opened.statusCode, opened.body).toBe(200);
    const chat = opened.json();
    expect(chat.members.map((m: { user: { id: string } }) => m.user.id)).toContain(FRITE_BOT_ID);
    expect(chat.encrypted).toBe(false);
    expect(chat.members.find((m: { user: { id: string } }) => m.user.id === FRITE_BOT_ID).user).toMatchObject({
      displayName: "Six Frites Game",
      avatarUrl: expect.stringContaining("/frite-bot.svg"),
    });
    expect((await call(me, "POST", "/v1/bot", { locale: "fr", open: false })).json().id).toBe(chat.id);
    expect((await get(me, `/v1/chats/${chat.id}/messages`)).items).toHaveLength(0);

    const game = (await call(me, "POST", "/v1/bot/games", { kind: "ttt", locale: "fr" })).json();
    expect(game).toMatchObject({ senderId: FRITE_BOT_ID, type: "game", game: { game: "ttt" } });
    const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => n !== game.game.cell)!;
    const played = (await call(me, "POST", `/v1/messages/${game.id}/game`, { cell: free })).json();
    expect(played.moves.map((m: { userId: string }) => m.userId)).toEqual([me.user.id, FRITE_BOT_ID]);

    const said = await call(me, "POST", `/v1/chats/${chat.id}/messages`, { clientId: "hi-bot", text: "salut" });
    expect(said.statusCode).toBe(403);

    const room = await createRoom(me.user.id, { game: "ludo", invite: [], locale: "fr" });
    endRoom(me.user.id, room.id);
    const texts = (await get(me, `/v1/chats/${chat.id}/messages`)).items.filter((m: { senderId: string; type: string }) => m.senderId === FRITE_BOT_ID && m.type !== "game");
    expect(texts).toEqual([]);

    await call(me, "DELETE", `/v1/chats/${chat.id}?scope=me`);
    const listed = async () => (await get(me, "/v1/chats")).items.some((c: { id: string }) => c.id === chat.id);
    expect(await listed()).toBe(false);
    await call(me, "POST", "/v1/bot", { locale: "fr", open: false });
    expect(await listed()).toBe(false);
    await call(me, "POST", "/v1/bot", { locale: "fr", open: true });
    expect(await listed()).toBe(true);
  });
});

describe("announcements", () => {
  it("come from Six Frites News in each member's chat with it, keep their styles, can't be answered, come back after a delete, and leave guests and banned people out", async () => {
    const member = (await loginAs(ctx.app, uniqueSub("member"))).json();
    const guest = (await loginAs(ctx.app, uniqueSub("guest"))).json();
    const banned = (await loginAs(ctx.app, uniqueSub("banned"))).json();
    await prisma.user.update({ where: { id: guest.user.id }, data: { guest: true } });
    await prisma.user.update({ where: { id: banned.user.id }, data: { bannedAt: new Date() } });

    const text = `Six Frites gets stories today ${uniqueSub("note")}`;
    expect((await call(member, "POST", "/v1/admin/announcements", { text })).statusCode).toBe(403);
    const boss = await asAdmin(ctx.app);
    const entities = [{ type: "bold", offset: 0, length: 10 }];
    const res = await call(boss, "POST", "/v1/admin/announcements", { text, entities });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ sent: res.json().members, emails: null });
    expect(await prisma.message.findFirst({ where: { senderId: SIX_FRITES_ID, text }, select: { entities: true } })).toMatchObject({ entities });

    const got = async (userId: string, t = text) =>
      prisma.message.count({ where: { senderId: SIX_FRITES_ID, text: t, chat: { members: { some: { userId } } } } });
    expect(await got(member.user.id)).toBe(1);
    expect(await got(guest.user.id)).toBe(0);
    expect(await got(banned.user.id)).toBe(0);

    type Chat = { id: string; members: { user: { id: string; displayName: string; avatarUrl: string } }[] };
    const news = (await get(member, "/v1/chats")).items.find((c: Chat) => c.members.some((m) => m.user.id === SIX_FRITES_ID)) as Chat;
    expect(news.members.find((m) => m.user.id === SIX_FRITES_ID)!.user).toMatchObject({
      displayName: "Six Frites News",
      avatarUrl: expect.stringContaining("/six-frites-news.png"),
    });
    const reply = await call(member, "POST", `/v1/chats/${news.id}/messages`, { clientId: "thanks", text: "thanks" });
    expect(reply.statusCode).toBe(403);

    const again = (await call(boss, "POST", "/v1/admin/announcements", { text, entities })).json();
    expect(again.sent).toBe(again.members);
    expect(await got(member.user.id)).toBe(1);

    await call(member, "DELETE", `/v1/chats/${news.id}?scope=me`);
    const next = `${text} again`;
    await call(boss, "POST", "/v1/admin/announcements", { text: next });
    expect(await got(member.user.id, next)).toBe(1);
    expect((await get(member, "/v1/chats")).items.some((c: Chat) => c.id === news.id)).toBe(true);
  }, 60_000);

  it("also go by email when asked, with the subject as title, to members who get emails", async () => {
    const member = (await loginAs(ctx.app, uniqueSub("reader"))).json();
    const quiet = (await loginAs(ctx.app, uniqueSub("no-mail"))).json();
    await prisma.user.update({ where: { id: quiet.user.id }, data: { mailOptOut: true } });
    const boss = await asAdmin(ctx.app);
    const subject = `Stories are here ${uniqueSub("subject")}`;
    const res = await call(boss, "POST", "/v1/admin/announcements", { text: "Post your first story today", email: { subject } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().emails).toBeGreaterThan(0);
    await vi.waitFor(async () => expect(await prisma.mailLog.count({ where: { kind: "announcement", subject, userId: member.user.id } })).toBe(1), {
      timeout: 30_000,
    });
    expect(await prisma.mailLog.count({ where: { kind: "announcement", subject, userId: quiet.user.id } })).toBe(0);
  }, 60_000);
});
