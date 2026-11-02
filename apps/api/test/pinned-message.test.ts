import { PIN_LIMIT } from "@six/shared";
import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

describe("pinned messages", () => {
  it("are shared by both people, newest first, announced, and go when unpinned or deleted", async () => {
    const { host, guest, chatId } = await makeFriends();
    const a = (await send(host, chatId, "meet at 6")).json();
    const b = (await send(guest, chatId, "bring chips")).json();
    const ids = async () => (await get(host, `/v1/chats/${chatId}`)).pinnedMessages.map((m: { id: string }) => m.id);

    await call(guest, "PATCH", `/v1/chats/${chatId}`, { pin: a.id });
    const chat = (await call(host, "PATCH", `/v1/chats/${chatId}`, { pin: b.id })).json();
    expect(chat.pinnedMessages.map((m: { text: string }) => m.text)).toEqual(["bring chips", "meet at 6"]);
    expect(chat.lastMessage).toMatchObject({ type: "service", action: { type: "pin" } });

    await call(host, "PATCH", `/v1/chats/${chatId}`, { pin: b.id });
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items).toHaveLength(4);
    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, { pin: chat.lastMessage.id })).json().error.code).toBe(
      "MESSAGE_NOT_FOUND",
    );

    await call(guest, "PATCH", `/v1/chats/${chatId}`, { unpin: b.id });
    expect(await ids()).toEqual([a.id]);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items).toHaveLength(4);

    await call(host, "DELETE", `/v1/messages?ids=${a.id}&scope=all`);
    expect(await ids()).toEqual([]);
  });

  it(`keeps the newest ${PIN_LIMIT}`, async () => {
    const { host, chatId } = await makeFriends();
    const sent = [];
    for (let i = 0; i <= PIN_LIMIT; i++) {
      const m = (await send(host, chatId, `m${i}`)).json();
      await call(host, "PATCH", `/v1/chats/${chatId}`, { pin: m.id });
      sent.push(m.id);
    }
    const pinned = (await get(host, `/v1/chats/${chatId}`)).pinnedMessages.map((m: { id: string }) => m.id);
    expect(pinned).toEqual(sent.slice(1).reverse());
  });
});
