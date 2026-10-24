import { describe, expect, it } from "vitest";
import { deleteExpiredMessages } from "../src/services/messages.js";
import { sendDueScheduled } from "../src/services/scheduled.js";
import { purgeAbandonedUploads } from "../src/services/uploads.js";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

const DAY = 24 * 60 * 60;
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const ids = (page: { items: { id: string }[] }) => page.items.map((m) => m.id);

describe("chat auto-delete", () => {
  it("is shared by both people, announced in the chat, and only applies to new messages", async () => {
    const { host, guest, chatId } = await makeFriends();
    const before = (await send(host, chatId, "before")).json();

    const set = await call(guest, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: DAY });
    expect(set.json()).toMatchObject({ autoDeleteSecs: DAY });
    expect((await get(host, `/v1/chats/${chatId}`)).autoDeleteSecs).toBe(DAY);

    const [notice] = (await get(host, `/v1/chats/${chatId}/messages`)).items;
    expect(notice).toMatchObject({
      type: "service",
      senderId: guest.user.id,
      action: { type: "auto_delete", secs: DAY },
      expiresAt: null,
    });
    expect((await call(guest, "PATCH", `/v1/messages/${notice.id}`, { text: "x" })).json().error.code).toBe(
      "MESSAGE_NOT_EDITABLE",
    );

    const after = (await send(host, chatId, "after")).json();
    expect(Date.parse(after.expiresAt) - Date.parse(after.createdAt)).toBe(DAY * 1000);
    expect(before.expiresAt).toBeNull();

    await call(host, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: DAY });
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items).toHaveLength(3);
    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: 60 })).json().error.code).toBe(
      "VALIDATION_FAILED",
    );

    await call(host, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: null });
    expect((await get(guest, `/v1/chats/${chatId}`)).lastMessage).toMatchObject({ action: { secs: null } });
    expect((await send(guest, chatId, "kept")).json().expiresAt).toBeNull();
  });

  it("deletes expired messages for everyone and scrubs them from sync", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(host, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: DAY });
    const secret = (await send(host, chatId, "secret")).json();
    const reply = (await send(guest, chatId, "ok", { replyToId: secret.id })).json();
    await prisma.message.update({ where: { id: secret.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const head = (await get(host, "/v1/sync")).cursor;

    expect(await deleteExpiredMessages()).toBeGreaterThanOrEqual(1);

    for (const who of [host, guest]) {
      const page = await get(who, `/v1/chats/${chatId}/messages`);
      expect(ids(page)).not.toContain(secret.id);
      expect(page.items.find((m: { id: string }) => m.id === reply.id).replyTo).toBeNull();
    }
    expect((await get(host, `/v1/sync?since=${head}`)).events).toMatchObject([
      { type: "message.deleted", data: { chatId, messageIds: [secret.id], scope: "me" } },
    ]);
    expect(JSON.stringify(await get(guest, "/v1/sync?since=0"))).not.toContain("secret");
  });
});

describe("scheduled messages", () => {
  it("stays private until sent, then arrives as a normal message", async () => {
    const { host, guest, chatId } = await makeFriends();
    const guestHead = (await get(guest, "/v1/sync")).cursor;
    const body = { clientId: `s-${Math.random()}`, text: "happy birthday", sendAt: inAnHour() };

    const scheduled = await call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, body);
    expect(scheduled.statusCode, scheduled.body).toBe(201);
    const s = scheduled.json();
    expect(s).toMatchObject({ text: "happy birthday", type: "text", sendAt: body.sendAt });
    expect((await call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, body)).json().id).toBe(s.id);

    expect((await get(host, `/v1/chats/${chatId}`)).scheduledCount).toBe(1);
    expect((await get(guest, `/v1/chats/${chatId}`)).scheduledCount).toBe(0);
    expect(ids(await get(host, `/v1/chats/${chatId}/scheduled-messages`))).toEqual([s.id]);
    expect((await get(guest, `/v1/chats/${chatId}/scheduled-messages`)).items).toEqual([]);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items).toEqual([]);
    expect((await get(guest, `/v1/sync?since=${guestHead}`)).events).toEqual([]);

    expect((await call(guest, "POST", `/v1/scheduled-messages/${s.id}/send`)).json().error.code).toBe(
      "SCHEDULED_NOT_FOUND",
    );
    const past = await call(host, "PATCH", `/v1/scheduled-messages/${s.id}`, { sendAt: new Date(0).toISOString() });
    expect(past.json().error.code).toBe("VALIDATION_FAILED");
    const edited = await call(host, "PATCH", `/v1/scheduled-messages/${s.id}`, { text: "happy **birthday**" });
    expect(edited.json()).toMatchObject({ text: "happy **birthday**", sendAt: body.sendAt });

    const sent = await call(host, "POST", `/v1/scheduled-messages/${s.id}/send`);
    expect(sent.json()).toMatchObject({ text: "happy **birthday**", clientId: body.clientId, type: "text" });
    expect(ids(await get(guest, `/v1/chats/${chatId}/messages`))).toEqual([sent.json().id]);
    expect((await get(host, `/v1/chats/${chatId}`)).scheduledCount).toBe(0);
    expect((await call(host, "POST", `/v1/scheduled-messages/${s.id}/send`)).json().error.code).toBe(
      "SCHEDULED_NOT_FOUND",
    );
    expect((await call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, body)).json().error.code).toBe(
      "CONFLICT",
    );
  });

  it("is sent by the sweep when due, and can be cancelled", async () => {
    const { host, guest, chatId } = await makeFriends();
    const schedule = (text: string) =>
      call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, {
        clientId: `s-${Math.random()}`,
        text,
        sendAt: inAnHour(),
      }).then((r) => r.json());
    const due = await schedule("due");
    const later = await schedule("later");
    await prisma.scheduledMessage.update({ where: { id: due.id }, data: { sendAt: new Date(Date.now() - 1000) } });

    await sendDueScheduled();
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items.map((m: { text: string }) => m.text)).toEqual([
      "due",
    ]);
    expect(ids(await get(host, `/v1/chats/${chatId}/scheduled-messages`))).toEqual([later.id]);

    expect((await call(host, "DELETE", `/v1/scheduled-messages/${later.id}`)).statusCode).toBe(204);
    expect((await get(host, `/v1/chats/${chatId}/scheduled-messages`)).items).toEqual([]);
    expect(
      (
        await call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, {
          clientId: "x",
          text: "no",
          sendAt: new Date(0).toISOString(),
        })
      ).json().error.code,
    ).toBe("VALIDATION_FAILED");
  });

  it("holds on to its file until it is sent", async () => {
    const { host, guest, chatId } = await makeFriends();
    const file = await prisma.upload.create({
      data: {
        ownerId: host.user.id,
        kind: "file",
        status: "ready",
        name: "plan.pdf",
        mime: "application/pdf",
        size: 4,
        key: `test/${Math.random()}`,
        createdAt: new Date(Date.now() - 2 * DAY * 1000),
      },
    });
    const s = (
      await call(host, "POST", `/v1/chats/${chatId}/scheduled-messages`, {
        clientId: `s-${Math.random()}`,
        attachmentId: file.id,
        sendAt: inAnHour(),
      })
    ).json();
    expect(s).toMatchObject({ type: "file", attachment: { id: file.id } });
    expect((await send(host, chatId, "again", { attachmentId: file.id })).json().error.code).toBe("UPLOAD_IN_USE");

    await purgeAbandonedUploads();
    expect(await prisma.upload.findUnique({ where: { id: file.id } })).not.toBeNull();

    await call(host, "POST", `/v1/scheduled-messages/${s.id}/send`);
    expect((await get(guest, `/v1/chats/${chatId}/messages`)).items[0]).toMatchObject({
      type: "file",
      attachment: { id: file.id, name: "plan.pdf" },
    });
  });
});
