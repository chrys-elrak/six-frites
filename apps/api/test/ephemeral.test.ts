import { afterAll, describe, expect, it } from "vitest";
import { timersQueue } from "../src/lib/queue.js";
import { expireMessage } from "../src/services/messages.js";
import { type Auth, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

afterAll(async () => {
  await timersQueue().obliterate({ force: true });
  await timersQueue().close();
});

const view = (who: Auth, id: string) => call(who, "POST", `/v1/messages/${id}/view`);
const latest = async (who: Auth, chatId: string) => (await get(who, `/v1/chats/${chatId}/messages`)).items[0];

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

    for (const who of [guest, host]) {
      expect(await latest(who, chatId)).toMatchObject({ text: null, ephemeral: { expired: true } });
    }
    expect((await latest(host, chatId)).ephemeral.views).toBe(1);
    expect((await view(guest, sent.id)).json().error.code).toBe("MESSAGE_EXPIRED");
    expect(JSON.stringify(await get(host, "/v1/sync?since=0"))).not.toContain("4242");
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

    const job = await timersQueue().getJob(`expire-${sent.id}`);
    expect(job?.data).toEqual({ messageId: sent.id });
    expect((await view(guest, sent.id)).json().message.text).toBe("10 seconds");

    await expireMessage(sent.id);
    expect((await view(guest, sent.id)).json().error.code).toBe("MESSAGE_EXPIRED");
    expect(await latest(host, chatId)).toMatchObject({ text: null, ephemeral: { expired: true } });
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

    const purge = (await timersQueue().getDelayed()).find((j) => "uploadIds" in j.data && j.data.uploadIds.includes(pre.upload.id));
    expect(purge?.opts.delay).toBe(300_000);
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
