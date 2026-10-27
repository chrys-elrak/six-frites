import { afterAll, describe, expect, it } from "vitest";
import { timersQueue } from "../src/lib/queue.js";
import { prisma } from "../src/lib/prisma.js";
import { expireMessage, purgeMessage } from "../src/services/messages.js";
import { type Auth, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

afterAll(async () => {
  await timersQueue().obliterate({ force: true });
  await timersQueue().close();
});

const view = (who: Auth, id: string) => call(who, "POST", `/v1/messages/${id}/view`);
const latest = async (who: Auth, chatId: string) => (await get(who, `/v1/chats/${chatId}/messages`)).items[0];

describe("resending self-destructing messages", () => {
  const resend = (who: Auth, id: string) => call(who, "POST", `/v1/messages/${id}/resend`);

  it("re-arms an opened message for the recipient, at most three times", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "look again", { ephemeral: { maxViews: 1 } })).json();
    expect(sent.ephemeral.resent).toBe(false);
    expect((await resend(host, sent.id)).json().error.code).toBe("RESEND_NOT_ALLOWED");

    for (let round = 1; round <= 3; round++) {
      expect((await view(guest, sent.id)).json().message.text).toBe("look again");
      const again = (await resend(host, sent.id)).json();
      expect(again.ephemeral).toMatchObject({ expired: false, views: 0, resendsLeft: 3 - round });
      expect(await latest(guest, chatId)).toMatchObject({ text: null, ephemeral: { locked: true, views: 0, resent: true } });
    }

    expect((await view(guest, sent.id)).json().message.text).toBe("look again");
    expect(await latest(host, chatId)).toMatchObject({ text: null, ephemeral: { purged: true, resendsLeft: 0 } });
    expect((await resend(host, sent.id)).json().error.code).toBe("MESSAGE_EXPIRED");
  });

  it("is only for the sender, and only within an hour of opening", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "late", { ephemeral: { maxViews: 1 } })).json();
    await view(guest, sent.id);
    expect((await resend(guest, sent.id)).json().error.code).toBe("NOT_MESSAGE_SENDER");
    const until = Date.parse((await latest(host, chatId)).ephemeral.resendUntil);
    expect(until - Date.now()).toBeGreaterThan(59 * 60 * 1000);

    await prisma.message.update({ where: { id: sent.id }, data: { expiredAt: new Date(Date.now() - 61 * 60 * 1000) } });
    expect((await resend(host, sent.id)).json().error.code).toBe("RESEND_NOT_ALLOWED");
  });

  it("ignores timer jobs left over from before a resend", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "cycle", { ephemeral: { maxViews: 1 } })).json();
    await view(guest, sent.id);
    await resend(host, sent.id);

    await purgeMessage(sent.id, 0);
    await expireMessage(sent.id, 0);
    expect(await latest(guest, chatId)).toMatchObject({ ephemeral: { locked: true, expired: false, purged: false } });
    expect((await view(guest, sent.id)).json().message.text).toBe("cycle");
  });
});

describe("self-destructing messages", () => {
  it("view once: hidden until opened, then gone for both, with no trace in sync", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "the code is 4242", { ephemeral: { maxViews: 1 } })).json();
    expect(sent).toMatchObject({ text: "the code is 4242", ephemeral: { maxViews: 1, views: 0, locked: false } });

    const locked = await latest(guest, chatId);
    expect(locked).toMatchObject({ text: null, ephemeral: { locked: true, views: 0, expired: false } });
    expect(JSON.stringify(await get(guest, "/v1/sync?since=0"))).not.toContain("4242");
    expect(JSON.stringify(await get(guest, `/v1/chats/${chatId}`))).not.toContain("4242");

    const opened = (await view(guest, sent.id)).json();
    expect(opened).toMatchObject({ message: { text: "the code is 4242", ephemeral: { views: 1 } }, expiresAt: null });

    expect(await latest(guest, chatId)).toMatchObject({ text: null, ephemeral: { expired: true } });
    expect(await latest(host, chatId)).toMatchObject({
      text: "the code is 4242",
      ephemeral: { expired: true, purged: false, views: 1, resendsLeft: 3 },
    });
    expect((await view(guest, sent.id)).json().error.code).toBe("MESSAGE_EXPIRED");
    expect(JSON.stringify(await get(guest, "/v1/sync?since=0"))).not.toContain("4242");

    await purgeMessage(sent.id, 0);
    for (const who of [guest, host]) {
      expect(await latest(who, chatId)).toMatchObject({ text: null, ephemeral: { expired: true, purged: true } });
      expect(JSON.stringify(await get(who, "/v1/sync?since=0"))).not.toContain("4242");
    }
  });

  it("view twice allows exactly two opens", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "twice", { ephemeral: { maxViews: 2 } })).json();
    expect((await view(guest, sent.id)).json().message.text).toBe("twice");
    expect(await latest(host, chatId)).toMatchObject({ ephemeral: { views: 1, expired: false } });
    expect((await view(guest, sent.id)).json().message.text).toBe("twice");
    expect((await view(guest, sent.id)).json().error.code).toBe("MESSAGE_EXPIRED");
  });

  it("timers start on the first view and expire the message", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "10 seconds", { ephemeral: { ttlSeconds: 10 } })).json();
    const opened = (await view(guest, sent.id)).json();
    const left = Date.parse(opened.expiresAt) - Date.now();
    expect(left).toBeGreaterThan(8000);
    expect(left).toBeLessThanOrEqual(10_000);

    const job = await timersQueue().getJob(`expire-${sent.id}-0`);
    expect(job?.data).toEqual({ messageId: sent.id, cycle: 0 });
    expect((await view(guest, sent.id)).json().message.text).toBe("10 seconds");

    await expireMessage(sent.id, 0);
    expect((await view(guest, sent.id)).json().error.code).toBe("MESSAGE_EXPIRED");
    expect(await latest(host, chatId)).toMatchObject({ text: "10 seconds", ephemeral: { expired: true } });
  });

  it("hands out short-lived links for opened media and schedules deleting the file", async () => {
    const { host, guest, chatId } = await makeFriends();
    const body = new TextEncoder().encode("secret file");
    const pre = (await call(host, "POST", "/v1/uploads/presign", { kind: "file", mime: "text/plain", size: body.length, name: "s.txt" })).json();
    await fetch(pre.url, { method: "PUT", body, headers: pre.headers });
    await call(host, "POST", `/v1/uploads/${pre.upload.id}/complete`);
    const sent = (await send(host, chatId, undefined as unknown as string, { attachmentId: pre.upload.id, ephemeral: { maxViews: 1 } })).json();

    expect(await latest(guest, chatId)).toMatchObject({ attachment: null, ephemeral: { locked: true } });
    const opened = (await view(guest, sent.id)).json();
    expect(new URL(opened.message.attachment.url).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(await (await fetch(opened.message.attachment.url)).text()).toBe("secret file");

    const wipe = await timersQueue().getJob(`purge-${sent.id}-0`);
    expect(wipe?.opts.delay).toBe(60 * 60 * 1000);

    await purgeMessage(sent.id, 0);
    const files = (await timersQueue().getJobs(["delayed", "waiting"])).find(
      (j) => "uploadIds" in j.data && j.data.uploadIds.includes(pre.upload.id),
    );
    expect(files).toBeDefined();
  });

  it("cannot be edited, stays hidden in reply quotes, and is invisible to outsiders", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(host, chatId, "psst", { ephemeral: { maxViews: 1 } })).json();
    expect((await call(host, "PATCH", `/v1/messages/${sent.id}`, { text: "changed" })).json().error.code).toBe(
      "MESSAGE_NOT_EDITABLE",
    );
    const reply = (await send(guest, chatId, "what?", { replyToId: sent.id })).json();
    expect(reply.replyTo).toMatchObject({ text: null, ephemeral: true });

    const stranger = await signUp("snoop");
    expect((await view(stranger, sent.id)).json().error.code).toBe("MESSAGE_NOT_FOUND");
    const normal = (await send(host, chatId, "plain")).json();
    expect((await view(guest, normal.id)).json()).toMatchObject({ message: { text: "plain", ephemeral: null }, expiresAt: null });
  });
});
