import { FRITE_BOT_ID } from "@six/shared";
import { describe, expect, it, vi } from "vitest";
import { createRoom, endRoom } from "../src/services/live.js";
import { chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

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
    const hello = (await get(me, `/v1/chats/${chat.id}/messages`)).items;
    expect(hello).toHaveLength(1);
    expect(hello[0].text).toContain("Six Frites Game");

    const game = (await call(me, "POST", "/v1/bot/games", { kind: "ttt", locale: "fr" })).json();
    expect(game).toMatchObject({ senderId: FRITE_BOT_ID, type: "game", game: { game: "ttt" } });
    const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => n !== game.game.cell)!;
    const played = (await call(me, "POST", `/v1/messages/${game.id}/game`, { cell: free })).json();
    expect(played.moves.map((m: { userId: string }) => m.userId)).toEqual([me.user.id, FRITE_BOT_ID]);

    await call(me, "POST", `/v1/chats/${chat.id}/messages`, { clientId: "hi-bot", text: "salut" });
    const latest = (await get(me, `/v1/chats/${chat.id}/messages`)).items[0];
    expect(latest).toMatchObject({ senderId: FRITE_BOT_ID, text: expect.stringContaining("jeux") });

    const room = await createRoom(me.user.id, { game: "ludo", invite: [], locale: "fr" });
    await vi.waitFor(async () =>
      expect((await get(me, `/v1/chats/${chat.id}/messages`)).items[0]).toMatchObject({
        senderId: FRITE_BOT_ID,
        action: { type: "live_invite", game: "ludo", roomId: room.id },
      }),
    );
    endRoom(me.user.id, room.id);

    await call(me, "DELETE", `/v1/chats/${chat.id}?scope=me`);
    const listed = async () => (await get(me, "/v1/chats")).items.some((c: { id: string }) => c.id === chat.id);
    expect(await listed()).toBe(false);
    await call(me, "POST", "/v1/bot", { locale: "fr", open: false });
    expect(await listed()).toBe(false);
    await call(me, "POST", "/v1/bot", { locale: "fr", open: true });
    expect(await listed()).toBe(true);
  });
});
