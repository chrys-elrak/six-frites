import { QUICK_REACTIONS } from "@six/shared";
import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

describe("message effects", () => {
  it("sends text with an effect and refuses an effect without text", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "surprise", { effect: "gift" })).json();
    expect(sent.effect).toBe("gift");
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0].effect).toBe("gift");
    expect((await send(host, chatId, "plain")).json().effect).toBeNull();

    const noText = await call(host, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: `c-${Math.random()}`,
      location: { lat: 1, lng: 2 },
      effect: "fire",
    });
    expect(noText.statusCode).toBe(400);
  });
});

describe("quick reactions", () => {
  it("saves six different emojis on the account and starts empty", async () => {
    const { host } = await makeFriends();
    expect((await get(host, "/v1/me")).quickReactions).toEqual([]);

    const mine = ["🔥", "😍", "😂", "😮", "😢", "👏"];
    expect((await call(host, "PATCH", "/v1/me", { quickReactions: mine })).json().quickReactions).toEqual(mine);
    expect((await get(host, "/v1/me")).quickReactions).toEqual(mine);

    expect((await call(host, "PATCH", "/v1/me", { quickReactions: mine.slice(1) })).statusCode).toBe(400);
    expect((await call(host, "PATCH", "/v1/me", { quickReactions: ["🔥", ...mine.slice(1, 5), "🔥"] })).statusCode).toBe(400);
    expect((await call(host, "PATCH", "/v1/me", { quickReactions: [...QUICK_REACTIONS] })).statusCode).toBe(200);
  });
});
