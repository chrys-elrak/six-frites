import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setIo } from "../src/lib/realtime.js";
import { createSocketServer } from "../src/socket/index.js";
import { type Auth, bearer, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();

const { signUp, get, makeFriends } = chatHelpers(ctx);
const send = (who: Auth, chatId: string, text: string, clientId = `c-${Math.random()}`) =>
  chatHelpers(ctx).send(who, chatId, text, { clientId });

describe("chats over REST", () => {
  it("connects both people when an invite is used and lists their chat right away", async () => {
    const { host, guest, chatId } = await makeFriends();
    const guestContacts = await get(guest, "/v1/contacts");
    expect(guestContacts.items).toHaveLength(1);
    expect(guestContacts.items[0]).toMatchObject({ user: { id: host.user.id }, chatId, customName: null });
    expect((await get(guest, "/v1/chats")).items.map((c: { id: string }) => c.id)).toEqual([chatId]);
    expect((await get(guest, `/v1/chats/${chatId}`)).members).toHaveLength(2);

    await send(guest, chatId, "hi");
    expect((await get(host, "/v1/chats")).items.map((c: { id: string }) => c.id)).toEqual([chatId]);

    const events = await get(host, "/v1/sync?since=0");
    expect(events.events.map((e: { type: string }) => e.type)[0]).toBe("chat.updated");
  });

  it("sends idempotently and tracks unread counts", async () => {
    const { host, guest, chatId } = await makeFriends();
    const first = await send(host, chatId, "hello", "same-id");
    const retry = await send(host, chatId, "hello", "same-id");
    expect(first.statusCode).toBe(201);
    expect(retry.json().id).toBe(first.json().id);
    await send(host, chatId, "second");

    const messages = await get(guest, `/v1/chats/${chatId}/messages`);
    expect(messages.items.map((m: { text: string }) => m.text)).toEqual(["second", "hello"]);

    expect((await get(guest, `/v1/chats/${chatId}`)).unreadCount).toBe(2);
    expect((await get(host, `/v1/chats/${chatId}`)).unreadCount).toBe(0);
    expect((await get(guest, `/v1/chats/${chatId}`)).lastMessage.text).toBe("second");
  });

  it("hides chats from non-members", async () => {
    const { chatId } = await makeFriends();
    const stranger = await signUp("stranger");
    expect((await get(stranger, `/v1/chats/${chatId}`)).error.code).toBe("CHAT_NOT_FOUND");
    expect((await send(stranger, chatId, "hi")).json().error.code).toBe("CHAT_NOT_FOUND");
  });

  it("moves the read marker forward only", async () => {
    const { host, guest, chatId } = await makeFriends();
    const m1 = (await send(host, chatId, "one")).json();
    await send(host, chatId, "two");

    const read = (path: string, payload: unknown) =>
      ctx.app.inject({ method: "POST", url: path, headers: bearer(guest.accessToken), payload: payload as object });

    expect((await read(`/v1/chats/${chatId}/read`, { messageId: m1.id })).json().lastReadMessageId).toBe(m1.id);
    expect((await get(guest, `/v1/chats/${chatId}`)).unreadCount).toBe(1);

    expect((await read(`/v1/chats/${chatId}/read`, {})).json().chatId).toBe(chatId);
    expect((await get(guest, `/v1/chats/${chatId}`)).unreadCount).toBe(0);
    expect((await read(`/v1/chats/${chatId}/read`, { messageId: m1.id })).body).toBe("null");

    const hostView = await get(host, `/v1/chats/${chatId}`);
    const guestMember = hostView.members.find((m: { user: { id: string } }) => m.user.id === guest.user.id);
    expect(guestMember.lastReadAt).not.toBeNull();
  });

  it("orders chats by latest activity with a cursor", async () => {
    const host = await signUp("Popular");
    const chatIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const invite = await ctx.app.inject({ method: "POST", url: "/v1/invites", headers: bearer(host.accessToken), payload: {} });
      await signUp(`friend${i}`, { inviteCode: invite.json().code });
    }
    const contacts = await get(host, "/v1/contacts");
    chatIds.push(...contacts.items.map((c: { chatId: string }) => c.chatId));
    for (const id of chatIds) await send(host, id, "hello");

    await send(host, chatIds[2]!, "bump the oldest");
    const first = await get(host, "/v1/chats?limit=2");
    expect(first.items[0].id).toBe(chatIds[2]);
    const second = await get(host, `/v1/chats?limit=2&cursor=${first.nextCursor}`);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((c: { id: string }) => c.id)).size).toBe(3);
  });
});

describe("delivery receipts", () => {
  it("moves forward only, tells the sender, and is implied by reading", async () => {
    const { host, guest, chatId } = await makeFriends();
    const m1 = (await send(host, chatId, "one")).json();
    const m2 = (await send(host, chatId, "two")).json();
    const head = (await get(host, "/v1/sync")).cursor;
    const guestHead = (await get(guest, "/v1/sync")).cursor;

    const deliver = (messageId?: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/v1/chats/${chatId}/delivered`,
        headers: bearer(guest.accessToken),
        payload: messageId ? { messageId } : {},
      });

    expect((await deliver(m1.id)).json().lastDeliveredMessageId).toBe(m1.id);
    expect((await deliver(m1.id)).body).toBe("null");
    expect((await deliver()).json().lastDeliveredMessageId).toBe(m2.id);

    const events = await get(host, `/v1/sync?since=${head}`);
    expect(events.events.map((e: { type: string }) => e.type)).toEqual(["chat.delivered", "chat.delivered"]);
    expect((await get(guest, `/v1/sync?since=${guestHead}`)).events).toEqual([]);

    const m3 = (await send(host, chatId, "three")).json();
    await ctx.app.inject({
      method: "POST",
      url: `/v1/chats/${chatId}/read`,
      headers: bearer(guest.accessToken),
      payload: {},
    });
    const view = await get(host, `/v1/chats/${chatId}`);
    const g = view.members.find((m: { user: { id: string } }) => m.user.id === guest.user.id);
    expect(g.lastDeliveredMessageId).toBe(m3.id);
    expect((await deliver(m2.id)).body).toBe("null");
  });
});

describe("sync", () => {
  it("returns the head cursor, then pages through changes", async () => {
    const { host, guest, chatId } = await makeFriends();
    const head = await get(guest, "/v1/sync");
    expect(head.events).toEqual([]);

    for (let i = 0; i < 5; i++) await send(host, chatId, `m${i}`);

    const page1 = await get(guest, `/v1/sync?since=${head.cursor}&limit=3`);
    expect(page1.hasMore).toBe(true);
    const page2 = await get(guest, `/v1/sync?since=${page1.cursor}&limit=3`);
    expect(page2.hasMore).toBe(false);
    const texts = [...page1.events, ...page2.events].map((e: { data: { text: string } }) => e.data.text);
    expect(texts).toEqual(["m0", "m1", "m2", "m3", "m4"]);

    const empty = await get(guest, `/v1/sync?since=${page2.cursor}`);
    expect(empty).toMatchObject({ events: [], cursor: page2.cursor, hasMore: false });
  });
});

describe("socket", () => {
  let url: string;
  let io: ReturnType<typeof createSocketServer>;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    io = createSocketServer(ctx.app.server);
    await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
  });

  afterAll(() => sockets.forEach((s) => s.disconnect()));

  function open(token?: string) {
    const s = connect(url, { auth: token ? { token } : {}, transports: ["websocket"], forceNew: true });
    sockets.push(s);
    return s;
  }

  const connected = (s: Socket) =>
    new Promise<void>((resolve, reject) => {
      s.once("connect", () => resolve());
      s.once("connect_error", reject);
    });

  it("rejects connections without a valid token", async () => {
    const err = await connected(open("nope")).catch((e) => e);
    expect(err.data.error.code).toBe("UNAUTHENTICATED");
  });

  it("delivers sends to the other member with an event cursor", async () => {
    const { host, guest, chatId } = await makeFriends();
    const a = open(host.accessToken);
    const b = open(guest.accessToken);
    await Promise.all([connected(a), connected(b)]);

    const received = new Promise<{ eventId: string; type: string; data: { text: string } }>((resolve) =>
      b.on("change", (e) => e.type === "message.new" && resolve(e)),
    );
    const ack = await a.emitWithAck("message:send", { chatId, clientId: "sock-1", text: "over the wire" });
    expect(ack.ok).toBe(true);

    const event = await received;
    expect(event.data.text).toBe("over the wire");
    expect(event.eventId).toMatch(/^\d+$/);

    const synced = await get(guest, `/v1/sync?since=${BigInt(event.eventId) - 1n}`);
    expect(synced.events[0].eventId).toBe(event.eventId);

    const bad = await a.emitWithAck("message:send", { chatId, clientId: "sock-2", text: "" });
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });

    const read = await b.emitWithAck("chat:read", { chatId });
    expect(read.ok && read.data.lastReadMessageId).toBe(ack.data.id);
  });

  it("delivers events raised outside the API process, like the media worker's", async () => {
    const { host, guest, chatId } = await makeFriends();
    const b = open(guest.accessToken);
    await connected(b);

    const received = new Promise<{ type: string; data: { text: string } }>((resolve) =>
      b.on("change", (e) => e.type === "message.new" && resolve(e)),
    );
    setIo(null);
    try {
      await send(host, chatId, "from another process");
      const event = await Promise.race([
        received,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("event never arrived")), 3000)),
      ]);
      expect(event.data.text).toBe("from another process");
    } finally {
      setIo(io);
    }
  });

  it("relays typing to the other member only", async () => {
    const { host, guest, chatId } = await makeFriends();
    const stranger = await signUp("lurker");
    const a = open(host.accessToken);
    const b = open(guest.accessToken);
    const c = open(stranger.accessToken);
    await Promise.all([connected(a), connected(b), connected(c)]);

    const seenByStranger: unknown[] = [];
    c.on("typing", (e) => seenByStranger.push(e));
    const echoedToSelf: unknown[] = [];
    a.on("typing", (e) => echoedToSelf.push(e));

    const got = new Promise((resolve) => b.once("typing", resolve));
    expect(await a.emitWithAck("chat:typing", { chatId, typing: true })).toMatchObject({ ok: true });
    expect(await got).toEqual({ chatId, userId: host.user.id, typing: true });

    const recording = new Promise((resolve) => b.once("typing", resolve));
    await a.emitWithAck("chat:typing", { chatId, typing: true, kind: "voice" });
    expect(await recording).toEqual({ chatId, userId: host.user.id, typing: true, kind: "voice" });

    const denied = await c.emitWithAck("chat:typing", { chatId, typing: true });
    expect(denied).toMatchObject({ ok: false, error: { code: "CHAT_NOT_FOUND" } });

    await new Promise((r) => setTimeout(r, 100));
    expect(seenByStranger).toEqual([]);
    expect(echoedToSelf).toEqual([]);
  });
});

describe("locations and checklists", () => {
  const { call } = chatHelpers(ctx);
  const post = (who: Auth, chatId: string, body: object) =>
    call(who, "POST", `/v1/chats/${chatId}/messages`, { clientId: `c-${Math.random()}`, ...body });

  it("shares a location on its own", async () => {
    const { host, guest, chatId } = await makeFriends();
    const where = { lat: -18.8792, lng: 47.5079, accuracy: 20 };
    const sent = await post(host, chatId, { location: where });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json()).toMatchObject({ type: "location", location: where, text: null });
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0]).toMatchObject({ type: "location", location: where });

    expect((await post(host, chatId, { location: where, text: "here" })).statusCode).toBe(400);
    expect((await post(host, chatId, { location: { lat: 91, lng: 0 } })).statusCode).toBe(400);
    expect((await post(host, chatId, { type: "location" })).statusCode).toBe(400);
  });

  it("lets either person tick checklist items, and keeps them from being edited", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = await post(host, chatId, { checklist: { title: " Groceries ", items: ["Milk", "Bread"] } });
    expect(sent.json()).toMatchObject({ type: "checklist", checklist: { title: "Groceries", items: ["Milk", "Bread"] }, checks: [] });
    const id = sent.json().id;
    const tick = (who: Auth, item: number, done: boolean) => call(who, "PUT", `/v1/messages/${id}/checklist/${item}`, { done });

    const ticked = await tick(guest, 1, true);
    expect(ticked.statusCode, ticked.body).toBe(200);
    expect(ticked.json().checks).toMatchObject([{ item: 1, userId: guest.user.id }]);
    expect((await tick(host, 1, true)).json().checks).toMatchObject([{ item: 1, userId: guest.user.id }]);
    expect((await tick(host, 1, false)).json().checks).toEqual([]);
    expect((await tick(host, 2, true)).json().error.code).toBe("NOT_FOUND");

    const text = (await post(host, chatId, { text: "not a list" })).json();
    expect((await call(host, "PUT", `/v1/messages/${text.id}/checklist/0`, { done: true })).json().error.code).toBe("NOT_FOUND");
    expect((await call(host, "PATCH", `/v1/messages/${id}`, { text: "edited" })).json().error.code).toBe("MESSAGE_NOT_EDITABLE");
    expect((await post(host, chatId, { checklist: { title: "Empty", items: [] } })).statusCode).toBe(400);
  });
});

describe("safe view and albums", () => {
  const { call } = chatHelpers(ctx);

  it("keeps safe view as each person's own chat setting", async () => {
    const { host, guest, chatId } = await makeFriends();
    expect((await get(guest, `/v1/chats/${chatId}`)).safeView).toBe(false);
    const on = await call(guest, "PATCH", `/v1/chats/${chatId}`, { safeView: true });
    expect(on.json()).toMatchObject({ safeView: true });
    expect((await get(host, `/v1/chats/${chatId}`)).safeView).toBe(false);
  });

  it("tags messages sent together with the same album id", async () => {
    const { host, chatId } = await makeFriends();
    const sent = await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "album-1", text: "one", groupId: "g-1" });
    expect(sent.json()).toMatchObject({ groupId: "g-1" });
    expect((await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "album-2", text: "two", groupId: "bad id!" })).statusCode).toBe(400);
  });
});

