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
    await send(guest, chatId, "hey");
    const updated = await call(host, "PATCH", `/v1/chats/${chatId}`, { archived: true, muted: true });
    expect(updated.json()).toMatchObject({ archived: true, muted: true, pinned: false });

    expect((await get(host, "/v1/chats")).items).toHaveLength(0);
    expect((await get(host, "/v1/chats?archived=true")).items[0].id).toBe(chatId);
    expect((await get(guest, `/v1/chats/${chatId}`)).archived).toBe(false);

    expect((await call(host, "PATCH", `/v1/chats/${chatId}`, {})).json().error.code).toBe("VALIDATION_FAILED");
  });
});

describe("contacts", () => {
  it("lists connections alphabetically with search and a cursor", async () => {
    const host = await signUp("hub");
    for (const name of ["Zed", "adam", "Bea"]) {
      const invite = await call(host, "POST", "/v1/invites", {});
      const guest = await signUp(name, { inviteCode: invite.json().code });
      await call(guest, "PUT", `/v1/contacts/${host.user.id}/profile`, { shared: true });
    }
    const names = (page: { items: { user: { displayName: string } }[] }) =>
      page.items.map((c) => c.user.displayName.split("-")[0]);

    const first = await get(host, "/v1/contacts?limit=2");
    const second = await get(host, `/v1/contacts?limit=2&cursor=${first.nextCursor}`);
    expect([...names(first), ...names(second)]).toEqual(["adam", "Bea", "Zed"]);
    expect(second.nextCursor).toBeNull();
    expect(names(await get(host, "/v1/contacts?q=BE"))).toEqual(["Bea"]);
  });
});

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("your own name and photo", () => {
  it("reach the people you chat with, and the old photo is deleted", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(host, "PUT", `/v1/contacts/${guest.user.id}/profile`, { shared: true });
    const head = (await get(guest, "/v1/sync")).cursor;

    const me = (await call(host, "PATCH", "/v1/me", { displayName: "Chef", photo: PNG_1PX })).json();
    expect(me).toMatchObject({ displayName: "Chef" });
    expect(me.avatarUrl).toMatch(/^http:\/\/localhost:8333\/six-test\/a\//);
    const photo = await fetch(me.avatarUrl);
    expect(Buffer.from(await photo.arrayBuffer()).toString("base64")).toBe(PNG_1PX.split(",")[1]);

    const { events } = await get(guest, `/v1/sync?since=${head}`);
    const chat = events.find((e: { type: string; data: { id: string } }) => e.type === "chat.updated" && e.data.id === chatId);
    expect(chat.data.members.find((m: { user: { id: string } }) => m.user.id === host.user.id).user).toMatchObject({
      displayName: "Chef",
      avatarUrl: me.avatarUrl,
    });

    expect((await call(host, "PATCH", "/v1/me", { photo: null })).json().avatarUrl).toBeNull();
    expect((await fetch(me.avatarUrl)).status).toBe(404);
  });

  it("stay hidden behind an alias until shared with that contact", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(host, "PATCH", "/v1/me", { photo: PNG_1PX });
    const me = await get(host, "/v1/me");
    expect(me.alias).toMatch(/^Frite \d{4}$/);
    const seen = async () =>
      (await get(guest, `/v1/chats/${chatId}`)).members.find((m: { user: { id: string } }) => m.user.id === host.user.id).user;

    expect(await seen()).toEqual({ id: host.user.id, displayName: me.alias, avatarUrl: null });
    expect((await get(guest, `/v1/chats/${chatId}`)).title).toBe(me.alias);
    expect((await get(guest, "/v1/contacts")).items[0]).toMatchObject({
      user: { displayName: me.alias, avatarUrl: null },
      originalName: me.alias,
    });
    expect((await get(guest, "/v1/contacts?q=host")).items).toEqual([]);
    const invite = (await call(host, "POST", "/v1/invites", {})).json();
    expect((await get(guest, `/v1/invites/${invite.code}`)).inviter).toEqual({
      id: host.user.id,
      displayName: me.alias,
      avatarUrl: null,
    });

    const shared = (await call(host, "PUT", `/v1/contacts/${guest.user.id}/profile`, { shared: true })).json();
    expect(shared.sharingProfile).toBe(true);
    expect((await get(host, `/v1/chats/${chatId}`)).sharingProfile).toBe(true);
    expect(await seen()).toMatchObject({ displayName: me.displayName, avatarUrl: expect.any(String) });
    expect((await get(guest, "/v1/contacts?q=host")).items).toHaveLength(1);
    expect((await get(guest, `/v1/chats/${chatId}`)).sharingProfile).toBe(false);

    await call(host, "PUT", `/v1/contacts/${guest.user.id}/profile`, { shared: false });
    expect(await seen()).toEqual({ id: host.user.id, displayName: me.alias, avatarUrl: null });
  });
});

describe("custom contact names and photos", () => {
  it("are applied only for the person who set them", async () => {
    const { host, guest, chatId } = await makeFriends();
    await send(guest, chatId, "hi");

    const res = await call(host, "PATCH", `/v1/contacts/${guest.user.id}`, { displayName: "Bestie", photo: PNG_1PX });
    expect(res.json()).toMatchObject({ customName: "Bestie", hasCustomPhoto: true, user: { displayName: "Bestie" } });
    const photoUrl: string = res.json().user.avatarUrl;
    expect(photoUrl).toMatch(/^http:\/\/localhost:8333\/six-test\/c\//);
    const photo = await fetch(photoUrl);
    expect(photo.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await photo.arrayBuffer()).toString("base64")).toBe(PNG_1PX.split(",")[1]);

    const hostChat = await get(host, `/v1/chats/${chatId}`);
    expect(hostChat.title).toBe("Bestie");
    expect(hostChat.members.find((m: { user: { id: string } }) => m.user.id === guest.user.id).user.avatarUrl).toBe(
      photoUrl,
    );
    expect((await get(host, "/v1/me/referrals")).items[0].user.displayName).toBe("Bestie");
    expect(await get(host, `/v1/contacts/${guest.user.id}`)).toMatchObject({ customName: "Bestie", chatId });

    const guestChat = await get(guest, `/v1/chats/${chatId}`);
    const guestSelf = guestChat.members.find((m: { user: { id: string } }) => m.user.id === guest.user.id);
    expect(guestSelf.user.displayName).not.toBe("Bestie");

    const reset = await call(host, "PATCH", `/v1/contacts/${guest.user.id}`, { displayName: null, photo: null });
    expect(reset.json()).toMatchObject({ customName: null, hasCustomPhoto: false });
    expect((await get(host, `/v1/chats/${chatId}`)).title).toBe(reset.json().originalName);
  });

  it("sorts and searches contacts by the name you gave them", async () => {
    const host = await signUp("sorter");
    const ids: string[] = [];
    for (const name of ["Mia", "Noah"]) {
      const invite = await call(host, "POST", "/v1/invites", {});
      ids.push((await signUp(name, { inviteCode: invite.json().code })).user.id);
    }
    await call(host, "PATCH", `/v1/contacts/${ids[1]}`, { displayName: "aaa Brother" });
    const list = await get(host, "/v1/contacts");
    expect(list.items.map((c: { user: { id: string } }) => c.user.id)).toEqual([ids[1], ids[0]]);
    expect((await get(host, "/v1/contacts?q=brother")).items).toHaveLength(1);
    expect((await get(host, "/v1/contacts?q=noah")).items).toHaveLength(0);
  });

  it("keep showing a renamed contact's own name, and go back to it", async () => {
    const { host, guest } = await makeFriends();
    await call(guest, "PUT", `/v1/contacts/${host.user.id}/profile`, { shared: true });
    const url = `/v1/contacts/${guest.user.id}`;
    const renamed = (await call(host, "PATCH", url, { displayName: "Bestie" })).json();
    expect(renamed).toMatchObject({ customName: "Bestie", originalName: expect.stringMatching(/^guest/) });

    const back = (await call(host, "PATCH", url, { displayName: null })).json();
    expect(back).toMatchObject({ customName: null, originalName: renamed.originalName });
  });

  it("rejects strangers and bad photos", async () => {
    const me = await signUp("picky");
    const stranger = await signUp("nobody");
    const notContact = await call(me, "PATCH", `/v1/contacts/${stranger.user.id}`, { displayName: "x" });
    expect(notContact.json().error.code).toBe("CONTACT_NOT_FOUND");

    const { host, guest } = await makeFriends();
    const svg = await call(host, "PATCH", `/v1/contacts/${guest.user.id}`, { photo: "data:image/svg+xml;base64,PHN2Zz4=" });
    expect(svg.json().error.code).toBe("VALIDATION_FAILED");
    const huge = `data:image/jpeg;base64,${"A".repeat(90_000)}`;
    expect((await call(host, "PATCH", `/v1/contacts/${guest.user.id}`, { photo: huge })).json().error.code).toBe(
      "VALIDATION_FAILED",
    );
  });
});

describe("spoilers", () => {
  it("are flagged on the message and in reply previews", async () => {
    const { host, guest, chatId } = await makeFriends();
    const secret = (await send(host, chatId, "the butler did it", { spoiler: true })).json();
    expect(secret.spoiler).toBe(true);
    const reply = (await send(guest, chatId, "no way", { replyToId: secret.id })).json();
    expect(reply.replyTo).toMatchObject({ spoiler: true });
    expect(reply.spoiler).toBe(false);
  });
});

describe("partial spoilers", () => {
  it("stores ranges, masks them in reply previews and replaces them on edit", async () => {
    const { host, guest, chatId } = await makeFriends();
    const text = "the killer is Bob, obviously";
    const entities = [{ type: "spoiler", offset: 14, length: 3 }];
    const m = (await send(host, chatId, text, { entities })).json();
    expect(m.entities).toEqual(entities);

    const reply = (await send(guest, chatId, "wow", { replyToId: m.id })).json();
    expect(reply.replyTo.text).toBe("the killer is ••••, obviously");
    expect(JSON.stringify(reply)).not.toContain("Bob");

    const edited = await call(host, "PATCH", `/v1/messages/${m.id}`, { text });
    expect(edited.json().entities).toEqual([]);
  });

  it("accepts overlapping formatting of different types", async () => {
    const { host, chatId } = await makeFriends();
    const entities = [
      { type: "bold", offset: 0, length: 9 },
      { type: "italic", offset: 5, length: 4 },
      { type: "spoiler", offset: 5, length: 4 },
      { type: "code", offset: 10, length: 3 },
    ];
    const m = await send(host, chatId, "very bold npm", { entities });
    expect(m.json().entities).toEqual(entities);
    const bad = await send(host, chatId, "nope", { entities: [{ type: "underline", offset: 0, length: 2 }] });
    expect(bad.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects ranges outside the text or overlapping", async () => {
    const { host, chatId } = await makeFriends();
    const outside = await send(host, chatId, "short", { entities: [{ type: "spoiler", offset: 3, length: 9 }] });
    expect(outside.json().error.code).toBe("VALIDATION_FAILED");
    const overlap = await send(host, chatId, "overlapping", {
      entities: [
        { type: "spoiler", offset: 0, length: 5 },
        { type: "spoiler", offset: 3, length: 2 },
      ],
    });
    expect(overlap.json().error.code).toBe("VALIDATION_FAILED");
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
    expect((await get(host, "/v1/chats")).items.map((c: { id: string }) => c.id)).toEqual([chatId]);
    expect((await get(host, "/v1/contacts")).items[0].chatId).toBe(chatId);
    expect((await get(host, `/v1/chats/${chatId}`)).lastMessage).toBeNull();
    expect(JSON.stringify(await get(host, "/v1/sync?since=0"))).not.toContain("gone soon");
  });

  it("deletes only the messages sent in a time range", async () => {
    const { host, guest, chatId } = await makeFriends();
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const old = (await send(host, chatId, "old")).json();
    await tick();
    const middle = (await send(guest, chatId, "middle")).json();
    await tick();
    await send(host, chatId, "new");
    const at = (iso: string) => encodeURIComponent(iso);

    const mine = await call(host, "DELETE", `/v1/chats/${chatId}?scope=me&from=${at(middle.createdAt)}&to=${at(middle.createdAt)}`);
    expect(mine.statusCode).toBe(204);
    expect(texts(await get(host, `/v1/chats/${chatId}/messages`))).toEqual(["new", "old"]);
    expect(texts(await get(guest, `/v1/chats/${chatId}/messages`))).toEqual(["new", "middle", "old"]);

    await call(guest, "DELETE", `/v1/chats/${chatId}?scope=all&to=${at(old.createdAt)}`);
    expect(texts(await get(guest, `/v1/chats/${chatId}/messages`))).toEqual(["new", "middle", null]);
    expect((await get(host, "/v1/chats")).items[0].id).toBe(chatId);

    const backwards = await call(host, "DELETE", `/v1/chats/${chatId}?from=${at(middle.createdAt)}&to=${at(old.createdAt)}`);
    expect(backwards.json().error.code).toBe("VALIDATION_FAILED");
  });
});

describe("app lock", () => {
  it("unlocks with its own code, which goes away when the lock is turned off", async () => {
    const me = await signUp("locked");
    expect((await call(me, "POST", "/v1/me/app-lock/unlock", { code: "1234" })).statusCode).toBe(204);

    expect((await call(me, "PUT", "/v1/me/app-lock", { code: "12ab" })).json().error.code).toBe("VALIDATION_FAILED");
    expect((await call(me, "PUT", "/v1/me/app-lock", { code: "1234" })).json().hasAppLock).toBe(true);
    expect((await get(me, "/v1/me")).hasAppLock).toBe(true);
    expect((await call(me, "POST", "/v1/me/app-lock/unlock", { code: "0000" })).json().error.code).toBe(
      "WRONG_APP_LOCK_CODE",
    );
    expect((await call(me, "POST", "/v1/me/app-lock/unlock", { code: "1234" })).statusCode).toBe(204);

    expect((await call(me, "DELETE", "/v1/me/app-lock")).json().hasAppLock).toBe(false);
    expect((await call(me, "PUT", "/v1/me/app-lock", { code: "56789" })).json().hasAppLock).toBe(true);
    expect((await call(me, "POST", "/v1/me/app-lock/unlock", { code: "1234" })).json().error.code).toBe(
      "WRONG_APP_LOCK_CODE",
    );
  });
});
