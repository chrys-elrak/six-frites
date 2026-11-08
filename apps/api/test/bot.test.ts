import { FRITE_BOT_ID } from "@six/shared";
import { describe, expect, it } from "vitest";
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
