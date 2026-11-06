import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const kinds = (list: { items: { kind: string; user: { id: string } }[] }) => list.items.map((n) => `${n.kind}:${n.user.id}`);

describe("notifications", () => {
  it("lists who joined, added me, reacted to or answered my story and called me, until I've seen them", async () => {
    const { host, guest, chatId } = await makeFriends();
    const stranger = await signUp("stranger");
    const { contactCode } = await get(host, "/v1/me");
    expect((await call(stranger, "POST", "/v1/contacts", { q: contactCode })).statusCode).toBe(200);

    const story = (await call(host, "POST", "/v1/stories", { text: "hello" })).json();
    await call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji: "🔥" });
    await call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji: "🔥" });
    expect((await send(guest, chatId, "nice", { storyId: story.id })).statusCode).toBe(201);
    await call(guest, "POST", `/v1/chats/${chatId}/calls`, { callId: "call-missed", video: true, durationSecs: null });
    await call(guest, "POST", `/v1/chats/${chatId}/calls`, { callId: "call-answered", video: false, durationSecs: 30 });

    const list = await get(host, "/v1/notifications");
    expect(kinds(list)).toEqual([
      `missed_call:${guest.user.id}`,
      `story_reply:${guest.user.id}`,
      `story_reaction:${guest.user.id}`,
      `added:${stranger.user.id}`,
      `joined:${guest.user.id}`,
    ]);
    expect(list.items[0]).toMatchObject({ chatId, video: true, unread: true });
    expect(list.items[2].emoji).toBe("🔥");
    expect(list.unread).toBe(5);

    expect((await call(host, "POST", "/v1/notifications/seen")).statusCode).toBe(204);
    const seen = await get(host, "/v1/notifications");
    expect(seen.unread).toBe(0);
    expect(seen.items.every((n: { unread: boolean }) => !n.unread)).toBe(true);
    expect((await get(guest, "/v1/notifications")).items).toEqual([]);
  });

  it("hides people I blocked", async () => {
    const { host, guest } = await makeFriends();
    expect((await call(host, "POST", `/v1/users/${guest.user.id}/block`)).statusCode).toBe(204);
    expect((await get(host, "/v1/notifications")).items).toEqual([]);
  });
});
