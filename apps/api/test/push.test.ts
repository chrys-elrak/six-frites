import type { PushPayload } from "@six/shared";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setActive } from "../src/lib/presence.js";
import { pushQueue } from "../src/lib/queue.js";
import { setPushProviders } from "../src/push/providers.js";
import { PUSH_DELAY_MS, deliverPush, deliverReactionPush } from "../src/services/push.js";
import { type Auth, chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

const sent: { token: string; payload: PushPayload }[] = [];
let gone = new Set<string>();

beforeEach(() => {
  sent.length = 0;
  gone = new Set();
  setPushProviders({
    webpush: {
      async send(token, payload) {
        if (gone.has(token)) return "gone";
        sent.push({ token, payload });
        return "sent";
      },
    },
  });
});

afterAll(async () => {
  await pushQueue().obliterate({ force: true });
  await pushQueue().close();
});

async function sessionOf(who: Auth) {
  return (await prisma.session.findFirstOrThrow({ where: { userId: who.user.id }, orderBy: { createdAt: "desc" } })).id;
}

async function subscribe(who: Auth, token = `sub-${who.user.id}`) {
  const res = await call(who, "POST", "/v1/devices/push-token", { provider: "webpush", token });
  expect(res.statusCode).toBe(204);
  return token;
}

describe("push notifications", () => {
  it("exposes the public config without signing in", async () => {
    const res = await ctx.app.inject({ url: "/v1/push/config" });
    expect(res.json()).toHaveProperty("webPushPublicKey");
  });

  it("queues a delayed push for each recipient when a message is sent", async () => {
    const { host, guest, chatId } = await makeFriends();
    const m = (await send(host, chatId, "ping")).json();
    const job = await pushQueue().getJob(`push-${m.id}-${guest.user.id}`);
    expect(job?.opts.delay).toBe(PUSH_DELAY_MS);
    expect(await pushQueue().getJob(`push-${m.id}-${host.user.id}`)).toBeUndefined();
  });

  it("sends the sender's name as the recipient sees it and a spoiler-safe preview", async () => {
    const { host, guest, chatId } = await makeFriends();
    const token = await subscribe(guest);
    await call(guest, "PATCH", `/v1/contacts/${host.user.id}`, { displayName: "Mum" });

    const m = (await send(host, chatId, "the code is 1234", { entities: [{ type: "spoiler", offset: 12, length: 4 }] })).json();
    expect(await deliverPush(m.id, guest.user.id)).toBe(1);
    expect(sent[0]).toMatchObject({
      token,
      payload: { title: "Mum", body: "the code is ••••", chatId, messageId: m.id, url: `/chats/${chatId}` },
    });

    const secret = (await send(host, chatId, "view me once", { ephemeral: { maxViews: 1 } })).json();
    await deliverPush(secret.id, guest.user.id);
    expect(sent[1]!.payload.body).toBe("Self-destructing message");
    expect(JSON.stringify(sent)).not.toContain("1234");
  });

  it("skips muted chats, messages already read, and devices in use", async () => {
    const { host, guest, chatId } = await makeFriends();
    await subscribe(guest);

    const read = (await send(host, chatId, "seen")).json();
    await call(guest, "POST", `/v1/chats/${chatId}/read`, {});
    expect(await deliverPush(read.id, guest.user.id)).toBe(0);

    const session = await sessionOf(guest);
    await setActive(session, true);
    const active = (await send(host, chatId, "you're here")).json();
    expect(await deliverPush(active.id, guest.user.id)).toBe(0);
    await setActive(session, false);
    expect(await deliverPush(active.id, guest.user.id)).toBe(1);

    await call(guest, "PATCH", `/v1/chats/${chatId}`, { muted: true });
    const muted = (await send(host, chatId, "shh")).json();
    expect(await deliverPush(muted.id, guest.user.id)).toBe(0);
    expect(await deliverPush(muted.id, host.user.id)).toBe(0);
  });

  it("treats an archived chat as muted", async () => {
    const { host, guest, chatId } = await makeFriends();
    await subscribe(guest);
    await call(guest, "PATCH", `/v1/chats/${chatId}`, { archived: true });
    const archived = (await send(host, chatId, "psst")).json();
    expect(await deliverPush(archived.id, guest.user.id)).toBe(0);
  });

  it("skips a message sent silently", async () => {
    const { host, guest, chatId } = await makeFriends();
    await subscribe(guest);
    const quiet = (await send(host, chatId, "no rush", { silent: true })).json();
    expect(quiet.silent).toBe(true);
    expect(await deliverPush(quiet.id, guest.user.id)).toBe(0);
  });

  it("stops muting once a timed mute ends", async () => {
    const { host, guest, chatId } = await makeFriends();
    await subscribe(guest);
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const chat = (await call(guest, "PATCH", `/v1/chats/${chatId}`, { muted: true, mutedUntil: until })).json();
    expect(chat).toMatchObject({ muted: true, mutedUntil: until });
    const quiet = (await send(host, chatId, "shh")).json();
    expect(await deliverPush(quiet.id, guest.user.id)).toBe(0);

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: guest.user.id } },
      data: { mutedUntil: new Date(Date.now() - 1000) },
    });
    expect(await get(guest, `/v1/chats/${chatId}`)).toMatchObject({ muted: false, mutedUntil: null });
    const loud = (await send(host, chatId, "hello again")).json();
    expect(await deliverPush(loud.id, guest.user.id)).toBe(1);

    const past = await call(guest, "PATCH", `/v1/chats/${chatId}`, { muted: true, mutedUntil: new Date(0).toISOString() });
    expect(past.json().error.code).toBe("VALIDATION_FAILED");
    const unmuted = (await call(guest, "PATCH", `/v1/chats/${chatId}`, { muted: false })).json();
    expect(unmuted).toMatchObject({ muted: false, mutedUntil: null });
  });

  it("tells the author about reactions that are still there", async () => {
    const { host, guest, chatId } = await makeFriends();
    const token = await subscribe(host);
    const m = (await send(host, chatId, "lunch?")).json();
    const reaction = { emoji: "👍", reactorId: guest.user.id };

    await call(guest, "POST", `/v1/messages/${m.id}/reactions`, { emoji: "👍" });
    const job = await pushQueue().getJob(`react-${m.id}-${guest.user.id}-${Buffer.from("👍").toString("hex")}`);
    expect(job?.data).toEqual({ messageId: m.id, userId: host.user.id, reaction });
    expect(job?.opts.delay).toBe(PUSH_DELAY_MS);

    expect(await deliverReactionPush(m.id, host.user.id, reaction)).toBe(1);
    expect(sent.at(-1)).toMatchObject({ token, payload: { body: "Reacted 👍 to “lunch?”", chatId, messageId: m.id } });

    await call(guest, "DELETE", `/v1/messages/${m.id}/reactions/${encodeURIComponent("👍")}`);
    expect(await deliverReactionPush(m.id, host.user.id, reaction)).toBe(0);

    await call(host, "POST", `/v1/messages/${m.id}/reactions`, { emoji: "😂" });
    expect(await pushQueue().getJob(`react-${m.id}-${host.user.id}-${Buffer.from("😂").toString("hex")}`)).toBeUndefined();

    await call(guest, "POST", `/v1/messages/${m.id}/reactions`, { emoji: "👍" });
    await call(host, "PATCH", `/v1/chats/${chatId}`, { muted: true });
    expect(await deliverReactionPush(m.id, host.user.id, reaction)).toBe(0);
  });

  it("writes each device's notifications in the language it registered with", async () => {
    const { host, guest, chatId } = await makeFriends();
    const res = await call(guest, "POST", "/v1/devices/push-token", { provider: "webpush", token: "fr", locale: "fr" });
    expect(res.statusCode).toBe(204);

    const secret = (await send(host, chatId, "view me once", { ephemeral: { maxViews: 1 } })).json();
    await deliverPush(secret.id, guest.user.id);
    expect(sent.at(-1)).toMatchObject({ token: "fr", payload: { body: "Message autodestructeur" } });

    await subscribe(guest, "fr");
    await deliverPush((await send(host, chatId, "view me too", { ephemeral: { maxViews: 1 } })).json().id, guest.user.id);
    expect(sent.at(-1)!.payload.body).toBe("Self-destructing message");
  });

  it("forgets subscriptions the push service says are gone, and on request", async () => {
    const { host, guest, chatId } = await makeFriends();
    const token = await subscribe(guest);
    gone.add(token);
    const m = (await send(host, chatId, "hello?")).json();
    expect(await deliverPush(m.id, guest.user.id)).toBe(0);
    expect(await prisma.pushToken.count({ where: { token } })).toBe(0);

    await subscribe(guest, "again");
    const del = await call(guest, "DELETE", "/v1/devices/push-token?provider=webpush");
    expect(del.statusCode).toBe(204);
    expect(await prisma.pushToken.count({ where: { token: "again" } })).toBe(0);
    expect((await get(guest, "/v1/me")).id).toBe(guest.user.id);
  });
});

describe("Web Push delivery", () => {
  it("sends an encrypted, VAPID-signed request and recognises dead subscriptions", async () => {
    const { createServer } = await import("node:http");
    const { createECDH, randomBytes } = await import("node:crypto");
    const webpush = (await import("web-push")).default;
    const { WebPushProvider } = await import("../src/push/providers.js");

    const requests: { headers: Record<string, unknown>; body: Buffer }[] = [];
    let status = 201;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        requests.push({ headers: req.headers, body: Buffer.concat(chunks) });
        res.writeHead(status).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;

    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const subscription = JSON.stringify({
      endpoint: `http://127.0.0.1:${port}/push/abc`,
      keys: { p256dh: browser.getPublicKey("base64url"), auth: randomBytes(16).toString("base64url") },
    });
    const vapid = webpush.generateVAPIDKeys();
    const provider = new WebPushProvider(vapid.publicKey, vapid.privateKey, "mailto:test@example.com");
    const payload = { title: "Ana", body: "hi there", icon: null, chatId: "c", messageId: "m", url: "/chats/c" };

    try {
      expect(await provider.send(subscription, payload)).toBe("sent");
      expect(requests[0]!.headers["content-encoding"]).toBe("aes128gcm");
      expect(String(requests[0]!.headers.authorization)).toMatch(/^vapid t=.+, k=/);
      expect(requests[0]!.body.toString("latin1")).not.toContain("hi there");

      status = 410;
      expect(await provider.send(subscription, payload)).toBe("gone");
    } finally {
      server.close();
    }
  });
});

describe("FCM delivery", () => {
  it("sends a data message the app can present and open, and recognises dead tokens", async () => {
    const { GoogleAuth } = await import("google-auth-library");
    const { FcmProvider } = await import("../src/push/providers.js");

    vi.spyOn(GoogleAuth.prototype, "getAccessToken").mockResolvedValue("oauth-token");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const provider = new FcmProvider({ project_id: "six", client_email: "x@six.iam.gserviceaccount.com", private_key: "k" });
    const payload = { title: "Ana", body: "hi there", icon: null, chatId: "c", messageId: "m", url: "/chats/c" };

    try {
      expect(await provider.send("device", payload)).toBe("sent");
      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe("https://fcm.googleapis.com/v1/projects/six/messages:send");
      expect((init!.headers as Record<string, string>).authorization).toBe("Bearer oauth-token");
      const { message } = JSON.parse(String(init!.body));
      expect(message).toMatchObject({ token: "device", android: { priority: "HIGH" } });
      expect(message.data).toMatchObject({ title: "Ana", message: "hi there", channelId: "messages", tag: "c" });
      expect(JSON.parse(message.data.body)).toEqual({ chatId: "c", messageId: "m", url: "/chats/c" });

      expect(await provider.send("device", payload)).toBe("gone");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
