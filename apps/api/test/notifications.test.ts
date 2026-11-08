import { describe, expect, it } from "vitest";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const kinds = (list: { items: { kind: string; user: { id: string } }[] }) => list.items.map((n) => `${n.kind}:${n.user.id}`);

describe("notifications", () => {
  it("tells someone once when they're unblocked", async () => {
    const { host, guest } = await makeFriends();
    await call(host, "POST", `/v1/users/${guest.user.id}/block`);
    await call(host, "DELETE", `/v1/users/${guest.user.id}/block`);
    await call(host, "DELETE", `/v1/users/${guest.user.id}/block`);

    const unblocked = (await get(guest, "/v1/notifications")).items.filter((n: { kind: string }) => n.kind === "unblocked");
    expect(unblocked).toMatchObject([{ user: { id: host.user.id } }]);
  });

  it("tells me about an anonymous message without saying who sent it", async () => {
    const [me, fan] = await Promise.all([signUp("me"), signUp("fan")]);
    const { askCode } = await get(me, "/v1/me");
    expect((await call(fan, "POST", `/v1/ask/${askCode}`, { text: "guess who" })).statusCode).toBe(204);

    const list = await get(me, "/v1/notifications");
    expect(list.items).toMatchObject([{ kind: "anon_message", user: null, chatId: null, unread: true }]);
    expect(JSON.stringify(list)).not.toContain(fan.user.id);
  });

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

  it("marks one unread again or read, and deletes one, only for its owner", async () => {
    const { host, guest } = await makeFriends();
    const stranger = await signUp("stranger");
    const { contactCode } = await get(host, "/v1/me");
    await call(stranger, "POST", "/v1/contacts", { q: contactCode });
    await call(host, "POST", "/v1/notifications/seen");
    const [added, joined] = (await get(host, "/v1/notifications")).items;

    expect((await call(host, "PATCH", `/v1/notifications/${joined.id}`, { unread: true })).statusCode).toBe(204);
    let list = await get(host, "/v1/notifications");
    expect(list.items.map((n: { unread: boolean }) => n.unread)).toEqual([false, true]);
    expect(list.unread).toBe(0);
    await call(host, "PATCH", `/v1/notifications/${joined.id}`, { unread: false });
    expect((await get(host, "/v1/notifications")).items[1].unread).toBe(false);

    expect((await call(guest, "DELETE", `/v1/notifications/${added.id}`)).statusCode).toBe(404);
    expect((await call(guest, "PATCH", `/v1/notifications/${added.id}`, { unread: true })).statusCode).toBe(404);
    expect((await call(host, "DELETE", `/v1/notifications/${added.id}`)).statusCode).toBe(204);
    list = await get(host, "/v1/notifications");
    expect(list.items.map((n: { id: string }) => n.id)).toEqual([joined.id]);
  });

  it("hides people I blocked", async () => {
    const { host, guest } = await makeFriends();
    expect((await call(host, "POST", `/v1/users/${guest.user.id}/block`)).statusCode).toBe(204);
    expect((await get(host, "/v1/notifications")).items).toEqual([]);
  });
});
