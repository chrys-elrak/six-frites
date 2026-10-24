import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

const sync = async (who: Parameters<typeof get>[0]) =>
  (await get(who, "/v1/sync?since=0")).events as { type: string; data: any }[];

describe("reactions", () => {
  it("lets each person add and remove several emoji, and syncs both sides", async () => {
    const { host, guest, chatId } = await makeFriends();
    const message = (await send(host, chatId, "hello")).json();
    const add = (who: typeof host, emoji: string) =>
      call(who, "POST", `/v1/messages/${message.id}/reactions`, { emoji });
    const remove = (who: typeof host, emoji: string) =>
      call(who, "DELETE", `/v1/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`);

    expect((await add(guest, "👍")).json().reactions).toEqual([{ emoji: "👍", userIds: [guest.user.id] }]);
    expect((await add(guest, "❤️")).json().reactions).toEqual([
      { emoji: "👍", userIds: [guest.user.id] },
      { emoji: "❤️", userIds: [guest.user.id] },
    ]);
    expect((await add(host, "👍")).json().reactions).toEqual([
      { emoji: "👍", userIds: [guest.user.id, host.user.id] },
      { emoji: "❤️", userIds: [guest.user.id] },
    ]);
    expect((await add(host, "👍")).statusCode).toBe(200);
    expect((await remove(guest, "👍")).json().reactions).toEqual([
      { emoji: "❤️", userIds: [guest.user.id] },
      { emoji: "👍", userIds: [host.user.id] },
    ]);
    expect((await remove(guest, "👍")).statusCode).toBe(200);

    const page = await get(host, `/v1/chats/${chatId}/messages`);
    expect(page.items[0].reactions).toHaveLength(2);

    const edits = (await sync(host)).filter((e) => e.type === "message.edited" && e.data.id === message.id);
    expect(edits.at(-1)!.data.reactions).toEqual(page.items[0].reactions);
    expect(edits.at(-1)!.data.editedAt).toBeNull();

    const reacted = (await sync(host)).filter((e) => e.type === "message.reacted").map((e) => e.data);
    expect(reacted).toEqual([
      { chatId, messageId: message.id, userId: guest.user.id, emoji: "👍" },
      { chatId, messageId: message.id, userId: guest.user.id, emoji: "❤️" },
    ]);
    expect((await sync(guest)).some((e) => e.type === "message.reacted")).toBe(false);
  });

  it("caps each person at 10 emoji per message", async () => {
    const { host, chatId } = await makeFriends();
    const { id } = (await send(host, chatId, "lots")).json();
    for (const emoji of ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃"]) {
      expect((await call(host, "POST", `/v1/messages/${id}/reactions`, { emoji })).statusCode).toBe(200);
    }
    expect((await call(host, "POST", `/v1/messages/${id}/reactions`, { emoji: "😉" })).json().error.code).toBe(
      "REACTION_LIMIT_REACHED",
    );
  });

  it("accepts any single emoji and rejects anything else", async () => {
    const { host, chatId } = await makeFriends();
    const { id } = (await send(host, chatId, "hi")).json();
    for (const emoji of ["👍🏽", "🇫🇷", "👨‍👩‍👧", "1️⃣"]) {
      expect((await call(host, "POST", `/v1/messages/${id}/reactions`, { emoji })).statusCode, emoji).toBe(200);
      expect((await call(host, "DELETE", `/v1/messages/${id}/reactions/${encodeURIComponent(emoji)}`)).statusCode).toBe(200);
    }
    for (const emoji of ["a", "👍👍", "", "ok👍"]) {
      expect((await call(host, "POST", `/v1/messages/${id}/reactions`, { emoji })).statusCode, emoji).toBe(400);
    }
  });

  it("refuses deleted messages and strangers", async () => {
    const { host, guest, chatId } = await makeFriends();
    const { host: stranger } = await makeFriends();
    const { id } = (await send(host, chatId, "bye")).json();

    expect((await call(stranger, "POST", `/v1/messages/${id}/reactions`, { emoji: "👍" })).json().error.code).toBe(
      "MESSAGE_NOT_FOUND",
    );
    await call(guest, "POST", `/v1/messages/${id}/reactions`, { emoji: "👍" });
    await call(host, "DELETE", `/v1/messages?ids=${id}&scope=all`);
    expect((await call(guest, "POST", `/v1/messages/${id}/reactions`, { emoji: "😢" })).json().error.code).toBe(
      "REACTION_NOT_ALLOWED",
    );
  });
});
