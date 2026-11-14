import type { PushPayload } from "@six/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pushQueue, timersQueue } from "../src/lib/queue.js";
import { setPushProviders } from "../src/push/providers.js";
import { closeChat } from "../src/services/chats.js";
import { deleteExpiredMessages, expireMessage, purgeMessage } from "../src/services/messages.js";
import { deliverPush } from "../src/services/push.js";
import { APP_LOCK_TRIES } from "../src/services/users.js";
import { type Auth, chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const pushed: PushPayload[] = [];
beforeEach(() => {
  pushed.length = 0;
  setPushProviders({
    webpush: {
      async send(_token, payload) {
        pushed.push(payload);
        return "sent";
      },
    },
  });
});

afterAll(async () => {
  await pushQueue().obliterate({ force: true });
  await pushQueue().close();
  await timersQueue().obliterate({ force: true });
  await timersQueue().close();
});

const unlock = (who: Auth, id: string, code: string) => call(who, "POST", `/v1/messages/${id}/unlock`, { code });
const latest = async (who: Auth, chatId: string) => (await get(who, `/v1/chats/${chatId}/messages`)).items[0];
const setCode = (who: Auth, code: string) => call(who, "PUT", "/v1/me/app-lock", { code });

describe("messages locked with a code", () => {
  it("hides the content from everyone, the sender included, until each opens it with their own code, every time", async () => {
    const { host, guest, chatId } = await makeFriends();
    const { cursor } = await get(host, "/v1/sync");
    const sent = await send(host, chatId, "the safe is 4711", { codeLock: true });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json()).toMatchObject({ text: null, codeLock: { locked: true } });
    expect(await latest(host, chatId)).toMatchObject({ text: null, codeLock: { locked: true } });
    const mine = await get(host, `/v1/chats/${chatId}`);
    expect(mine.lastMessage).toMatchObject({ text: null, codeLock: { locked: true } });
    expect(JSON.stringify(await get(host, `/v1/sync?since=${cursor}`))).not.toContain("4711");

    expect((await unlock(host, sent.json().id, "1234")).json().error.code).toBe("APP_LOCK_REQUIRED");
    await setCode(host, "9753");
    expect((await unlock(host, sent.json().id, "1111")).json().error.code).toBe("WRONG_APP_LOCK_CODE");
    expect((await unlock(host, sent.json().id, "9753")).json().message).toMatchObject({ text: "the safe is 4711", codeLock: { locked: false } });
    expect(await latest(host, chatId)).toMatchObject({ text: null, codeLock: { locked: true } });

    const hidden = await latest(guest, chatId);
    expect(hidden).toMatchObject({ id: sent.json().id, text: null, entities: [], attachment: null, codeLock: { locked: true } });
    const chat = await get(guest, `/v1/chats/${chatId}`);
    expect(chat.lastMessage).toMatchObject({ text: null, codeLock: { locked: true } });
    expect(JSON.stringify(chat)).not.toContain("4711");

    expect((await unlock(guest, hidden.id, "1234")).json().error.code).toBe("APP_LOCK_REQUIRED");
    await setCode(guest, "2468");
    expect((await unlock(guest, hidden.id, "1357")).json().error.code).toBe("WRONG_APP_LOCK_CODE");
    const opened = await unlock(guest, hidden.id, "2468");
    expect(opened.statusCode, opened.body).toBe(200);
    expect(opened.json()).toMatchObject({ message: { text: "the safe is 4711", codeLock: { locked: false } }, expiresAt: null });

    expect(await latest(guest, chatId)).toMatchObject({ text: null, codeLock: { locked: true } });
    expect(await prisma.messageView.count({ where: { messageId: hidden.id } })).toBe(0);
    expect((await unlock(guest, hidden.id, "2468")).json().message.text).toBe("the safe is 4711");
  });

  it("stays locked through edits, sync and quotes, and stays out of shared media", async () => {
    const { host, guest, chatId } = await makeFriends();
    const { cursor } = await get(guest, "/v1/sync");
    const { cursor: hostCursor } = await get(host, "/v1/sync");
    const sent = (await send(host, chatId, "first draft", { codeLock: true })).json();
    expect((await call(host, "PATCH", `/v1/messages/${sent.id}`, { text: "see https://example.com/secret" })).statusCode).toBe(200);
    const reply = (await send(host, chatId, "about that", { replyToId: sent.id })).json();
    expect(reply.replyTo).toMatchObject({ text: null, locked: true });

    const changes = await get(guest, `/v1/sync?since=${cursor}`);
    expect(JSON.stringify(changes)).not.toMatch(/first draft|example\.com/);
    expect(changes.events.find((c: { type: string }) => c.type === "message.edited").data).toMatchObject({ text: null, codeLock: { locked: true } });
    const ownChanges = await get(host, `/v1/sync?since=${hostCursor}`);
    expect(JSON.stringify(ownChanges)).not.toMatch(/first draft|example\.com/);
    expect(ownChanges.events.find((c: { type: string }) => c.type === "message.edited").data).toMatchObject({ text: null, codeLock: { locked: true } });

    expect((await get(guest, `/v1/chats/${chatId}/messages?only=links`)).items).toEqual([]);
    expect((await get(host, `/v1/chats/${chatId}/messages?only=links`)).items).toEqual([]);
    expect((await call(guest, "POST", `/v1/messages/${sent.id}/view`)).json().error.code).toBe("FORBIDDEN");
    expect((await call(host, "POST", `/v1/messages/${sent.id}/view`)).json().error.code).toBe("FORBIDDEN");
  });

  it("lets each group member open it with their own code", async () => {
    const owner = await signUp("owner");
    const group = (await call(owner, "POST", "/v1/groups", { title: "Vault", nickname: "#CAFE00", maxMembers: 3 })).json();
    const ana = await signUp("ana");
    const bo = await signUp("bo");
    await call(ana, "POST", `/v1/groups/join/${group.group.inviteCode}`, { nickname: "#A0A0A0" });
    await call(bo, "POST", `/v1/groups/join/${group.group.inviteCode}`, { nickname: "#B0B0B0" });
    await setCode(ana, "1111");
    await setCode(bo, "2222");

    const sent = (await send(owner, group.id, "group secret", { codeLock: true })).json();
    expect(await latest(ana, group.id)).toMatchObject({ text: null, codeLock: { locked: true } });
    expect((await unlock(ana, sent.id, "2222")).json().error.code).toBe("WRONG_APP_LOCK_CODE");
    expect((await unlock(ana, sent.id, "1111")).json().message.text).toBe("group secret");
    expect((await unlock(bo, sent.id, "2222")).json().message.text).toBe("group secret");
    expect((await unlock(await signUp("stranger"), sent.id, "1111")).json().error.code).toBe("MESSAGE_NOT_FOUND");
  });

  it("never shows in previews or push notifications", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(guest, "POST", "/v1/devices/push-token", { provider: "webpush", token: `sub-${guest.user.id}` });
    const sent = (await send(host, chatId, "pin 9090", { codeLock: true })).json();
    expect(await deliverPush(sent.id, guest.user.id)).toBe(1);
    expect(pushed[0]!.body).toBe("🔒 Locked message");
    expect(JSON.stringify(pushed)).not.toContain("9090");
  });

  it("only takes text, files and locations", async () => {
    const { host, chatId } = await makeFriends();
    const checklist = await call(host, "POST", `/v1/chats/${chatId}/messages`, {
      clientId: "list",
      checklist: { title: "t", items: ["a"] },
      codeLock: true,
    });
    expect(checklist.json().error.code).toBe("VALIDATION_FAILED");
    const place = await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "geo", location: { lat: 1, lng: 2 }, codeLock: true });
    expect(place.statusCode, place.body).toBe(201);
    const plain = (await send(host, chatId, "not locked")).json();
    expect(plain.codeLock).toBeNull();
  });

  it("self-destructs too: a right code counts the view, a wrong one doesn't, and the sender never burns it", async () => {
    const { host, guest, chatId } = await makeFriends();
    await setCode(host, "9753");
    await setCode(guest, "2468");
    const sent = (await send(host, chatId, "burn after reading", { codeLock: true, ephemeral: { maxViews: 1 } })).json();
    expect(sent).toMatchObject({ text: null, codeLock: { locked: true }, ephemeral: { maxViews: 1, locked: false } });
    expect(await latest(guest, chatId)).toMatchObject({ text: null, codeLock: { locked: true }, ephemeral: { locked: true, views: 0 } });
    expect((await call(guest, "POST", `/v1/messages/${sent.id}/view`)).json().error.code).toBe("FORBIDDEN");

    expect((await unlock(host, sent.id, "9753")).json().message.text).toBe("burn after reading");
    expect((await unlock(guest, sent.id, "0000")).json().error.code).toBe("WRONG_APP_LOCK_CODE");
    expect(await latest(guest, chatId)).toMatchObject({ ephemeral: { views: 0, expired: false } });

    expect((await unlock(guest, sent.id, "2468")).json().message.text).toBe("burn after reading");
    expect(await latest(guest, chatId)).toMatchObject({ text: null, ephemeral: { views: 1, expired: true } });
    expect(await latest(host, chatId)).toMatchObject({ ephemeral: { views: 1, expired: true, resendsLeft: 3 } });
    expect((await unlock(guest, sent.id, "2468")).json().error.code).toBe("MESSAGE_EXPIRED");

    expect((await call(host, "POST", `/v1/messages/${sent.id}/resend`)).json().ephemeral).toMatchObject({ expired: false, views: 0 });
    expect((await unlock(guest, sent.id, "2468")).json().message.text).toBe("burn after reading");
    await purgeMessage(sent.id, 1);
    expect(await latest(host, chatId)).toMatchObject({ text: null, ephemeral: { purged: true } });
  });

  it("starts the timer when opened with the code, and can be made to self-destruct after sending", async () => {
    const { host, guest, chatId } = await makeFriends();
    await setCode(guest, "2468");
    const sent = (await send(host, chatId, "ten seconds", { codeLock: true })).json();
    const made = await call(host, "POST", `/v1/messages/${sent.id}/self-destruct`, { ttlSeconds: 10 });
    expect(made.statusCode, made.body).toBe(200);
    expect(made.json()).toMatchObject({ codeLock: { locked: true }, ephemeral: { ttlSeconds: 10 } });

    const opened = (await unlock(guest, sent.id, "2468")).json();
    expect(opened.message.text).toBe("ten seconds");
    expect(Date.parse(opened.expiresAt) - Date.now()).toBeGreaterThan(8000);
    await expireMessage(sent.id, 0);
    expect(await latest(guest, chatId)).toMatchObject({ text: null, ephemeral: { expired: true } });
  });

  it("goes with the chat's auto-delete timer and with vanish mode", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(host, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: 24 * 60 * 60 });
    const timed = (await send(host, chatId, "for a day", { codeLock: true })).json();
    expect(timed.expiresAt).not.toBeNull();
    await prisma.message.update({ where: { id: timed.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await deleteExpiredMessages();
    expect(await prisma.message.count({ where: { id: timed.id } })).toBe(0);

    await call(host, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: null, vanish: true });
    const poof = (await send(host, chatId, "poof", { codeLock: true })).json();
    expect(poof.vanish).toBe(true);
    await call(guest, "POST", `/v1/chats/${chatId}/read`, {});
    await closeChat(guest.user.id, chatId);
    expect(await prisma.message.count({ where: { id: poof.id } })).toBe(0);
  });

  it("stops taking codes after too many wrong ones, even the right one", async () => {
    const { host, guest, chatId } = await makeFriends();
    await setCode(guest, "8642");
    const sent = (await send(host, chatId, "locked away", { codeLock: true })).json();
    for (let i = 0; i < APP_LOCK_TRIES; i++) expect((await unlock(guest, sent.id, "0000")).json().error.code).toBe("WRONG_APP_LOCK_CODE");
    const blocked = await unlock(guest, sent.id, "8642");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("RATE_LIMITED");
    expect((await call(guest, "POST", "/v1/me/app-lock/unlock", { code: "8642" })).json().error.code).toBe("RATE_LIMITED");
  });

  it("keeps the lock on scheduled messages", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sendAt = new Date(Date.now() + 60_000).toISOString();
    const s = (await call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, { clientId: "later", text: "later secret", codeLock: true, sendAt })).json();
    expect(s.codeLock).toBe(true);
    await call(host, "POST", `/v1/scheduled-messages/${s.id}/send`);
    expect(await latest(guest, chatId)).toMatchObject({ text: null, codeLock: { locked: true } });
    expect(await prisma.message.count({ where: { chatId, codeLock: true } })).toBe(1);
  });
});
