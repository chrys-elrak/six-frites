import { describe, expect, it } from "vitest";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const texts = (page: { items: { text: string | null }[] }) => page.items.map((m) => m.text);

describe("replies", () => {
  it("embeds a preview of the original and rejects replies across chats", async () => {
    const { host, guest, chatId } = await makeFriends();
    const original = (await send(host, chatId, "what time?")).json();
    const reply = (await send(guest, chatId, "8pm", { replyToId: original.id })).json();
    expect(reply.replyTo).toMatchObject({ id: original.id, text: "what time?", deleted: false });

    const other = await makeFriends();
    const foreign = await send(other.host, other.chatId, "nope", { replyToId: original.id });
    expect(foreign.json().error.code).toBe("MESSAGE_NOT_FOUND");
  });
});

describe("editing", () => {
  it("lets only the sender edit and notifies the chat", async () => {
    const { host, guest, chatId } = await makeFriends();
    const m = (await send(host, chatId, "helo")).json();
    const head = (await get(guest, "/v1/sync")).cursor;

    const edited = await call(host, "PATCH", `/v1/messages/${m.id}`, { text: "hello" });
    expect(edited.json()).toMatchObject({ text: "hello" });
    expect(edited.json().editedAt).not.toBeNull();

    const notMine = await call(guest, "PATCH", `/v1/messages/${m.id}`, { text: "hacked" });
    expect(notMine.json().error.code).toBe("NOT_MESSAGE_SENDER");

    const events = await get(guest, `/v1/sync?since=${head}`);
    expect(events.events).toMatchObject([{ type: "message.edited", data: { id: m.id, text: "hello" } }]);

    const stranger = await signUp("stranger");
    expect((await call(stranger, "PATCH", `/v1/messages/${m.id}`, { text: "x" })).json().error.code).toBe(
      "MESSAGE_NOT_FOUND",
    );
  });
});

describe("deleting messages", () => {
  it("hides messages only for me with scope=me", async () => {
    const { host, guest, chatId } = await makeFriends();
    const a = (await send(host, chatId, "keep")).json();
    const b = (await send(guest, chatId, "hide me")).json();

    const res = await call(host, "DELETE", `/v1/messages?ids=${b.id}&scope=me`);
    expect(res.statusCode).toBe(204);

    expect(texts(await get(host, `/v1/chats/${chatId}/messages`))).toEqual(["keep"]);
    expect(texts(await get(guest, `/v1/chats/${chatId}/messages`))).toEqual(["hide me", "keep"]);
    expect((await get(host, `/v1/chats/${chatId}`)).lastMessage.id).toBe(a.id);
  });

  it("lets either person in a direct chat delete any message for everyone, and scrubs it from sync", async () => {
    const { host, guest, chatId } = await makeFriends();
    const secret = (await send(host, chatId, "secret")).json();
    const reply = (await send(guest, chatId, "ok", { replyToId: secret.id })).json();

    expect((await call(guest, "DELETE", `/v1/messages?ids=${secret.id}&scope=all`)).statusCode).toBe(204);

    const page = await get(guest, `/v1/chats/${chatId}/messages`);
    const tomb = page.items.find((m: { id: string }) => m.id === secret.id);
    expect(tomb).toMatchObject({ text: null });
    expect(tomb.deletedAt).not.toBeNull();
    expect(page.items.find((m: { id: string }) => m.id === reply.id).replyTo).toMatchObject({
      deleted: true,
      text: null,
    });

    const replay = JSON.stringify(await get(guest, "/v1/sync?since=0"));
    expect(replay).not.toContain("secret");
    expect(replay).toContain("message.deleted");
  });

  it("removes a deleted placeholder for me, or for both people", async () => {
    const { host, guest, chatId } = await makeFriends();
    const a = (await send(host, chatId, "first")).json();
    const b = (await send(host, chatId, "second")).json();
    await call(host, "DELETE", `/v1/messages?ids=${a.id},${b.id}&scope=all`);

    await call(guest, "DELETE", `/v1/messages?ids=${a.id}&scope=me`);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items.map((m: { id: string }) => m.id)).toEqual([b.id]);
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items).toHaveLength(2);

    const head = (await get(host, "/v1/sync")).cursor;
    expect((await call(guest, "DELETE", `/v1/messages?ids=${b.id}&scope=all`)).statusCode).toBe(204);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items).toEqual([]);
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items.map((m: { id: string }) => m.id)).toEqual([a.id]);

    const events = await get(host, `/v1/sync?since=${head}`);
    expect(events.events).toMatchObject([{ type: "message.deleted", data: { messageIds: [b.id], scope: "me" } }]);
  });

  it("rejects unknown ids without deleting anything", async () => {
    const { host, chatId } = await makeFriends();
    const m = (await send(host, chatId, "still here")).json();
    const res = await call(host, "DELETE", `/v1/messages?ids=${m.id},nope&scope=all`);
    expect(res.json().error.code).toBe("MESSAGE_NOT_FOUND");
    expect((await prisma.message.findUnique({ where: { id: m.id } }))?.deletedAt).toBeNull();
  });
});

describe("chat settings", () => {
  it("archives, mutes and pins per member", async () => {
    const { host, guest, chatId } = await makeFriends();
    const updated = await call(host, "PATCH", `/v1/chats/${chatId}`, { archived: true, muted: true });
    expect(updated.json()).toMatchObject({ archived: true, muted: true, pinned: false });

    expect((await get(host, "/v1/chats")).items).toHaveLength(0);
    expect((await get(host, "/v1/chats?archived=true")).items[0].id).toBe(chatId);
    expect((await get(guest, `/v1/chats/${chatId}`)).archived).toBe(false);

    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, {})).json().error.code).toBe("VALIDATION_FAILED");
  });
});

describe("deleting chats", () => {
  it("scope=me clears my history and hides the chat until a new message", async () => {
    const { host, guest, chatId } = await makeFriends();
    await send(guest, chatId, "old news");
    expect((await call(host, "DELETE", `/v1/chats/${chatId}?scope=me`)).statusCode).toBe(204);

    expect((await get(host, "/v1/chats")).items).toHaveLength(0);
    expect((await get(guest, "/v1/chats")).items).toHaveLength(1);

    await send(guest, chatId, "you there?");
    const back = await get(host, "/v1/chats");
    expect(back.items[0].id).toBe(chatId);
    expect(back.items[0].unreadCount).toBe(1);
    expect(texts(await get(host, `/v1/chats/${chatId}/messages`))).toEqual(["you there?"]);
    expect(texts(await get(guest, `/v1/chats/${chatId}/messages`))).toEqual(["you there?", "old news"]);
  });

  it("scope=all wipes messages for both but keeps the chat", async () => {
    const { host, guest, chatId } = await makeFriends();
    await send(host, chatId, "gone soon");
    await call(guest, "DELETE", `/v1/chats/${chatId}?scope=all`);

    expect(texts(await get(host, `/v1/chats/${chatId}/messages`))).toEqual([]);
    expect((await get(host, `/v1/chats/${chatId}`)).lastMessage).toBeNull();
    expect(JSON.stringify(await get(host, "/v1/sync?since=0"))).not.toContain("gone soon");
  });
});
