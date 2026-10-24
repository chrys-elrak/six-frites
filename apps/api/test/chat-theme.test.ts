import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, makeFriends } = chatHelpers(ctx);

describe("chat background", () => {
  it("is shared by both people, announced in the chat, and survives sync", async () => {
    const { host, guest, chatId } = await makeFriends();
    const head = (await get(host, "/v1/sync")).cursor;

    expect((await call(guest, "PATCH", `/v1/chats/${chatId}`, { theme: "ketchup" })).json()).toMatchObject({
      theme: "ketchup",
    });
    expect((await get(host, `/v1/chats/${chatId}`)).theme).toBe("ketchup");

    const [notice] = (await get(host, `/v1/chats/${chatId}/messages`)).items;
    expect(notice).toMatchObject({ type: "service", senderId: guest.user.id, action: { type: "theme", theme: "ketchup" } });

    const events = (await get(host, `/v1/sync?since=${head}`)).events;
    expect(events).toContainEqual(expect.objectContaining({ type: "chat.updated", data: expect.objectContaining({ theme: "ketchup" }) }));

    await call(host, "PATCH", `/v1/chats/${chatId}`, { theme: "ketchup" });
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items).toHaveLength(1);

    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, { theme: "neon" })).json().error.code).toBe(
      "VALIDATION_FAILED",
    );

    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, { theme: "custom:#16a34a" })).json().theme).toBe(
      "custom:#16a34a",
    );
    expect(
      (await call(host, "PATCH", `/v1/chats/${chatId}`, { theme: "custom:#16a34a:#fde68a" })).json().theme,
    ).toBe("custom:#16a34a:#fde68a");
    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, { theme: "custom:green" })).json().error.code).toBe(
      "VALIDATION_FAILED",
    );

    await call(host, "PATCH", `/v1/chats/${chatId}`, { theme: null });
    expect((await get(guest, `/v1/chats/${chatId}`)).theme).toBeNull();
    expect((await get(guest, `/v1/chats/${chatId}`)).lastMessage).toMatchObject({
      action: { type: "theme", theme: null },
    });
  });
});
