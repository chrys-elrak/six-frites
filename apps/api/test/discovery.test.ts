import { describe, expect, it } from "vitest";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send } = chatHelpers(ctx);

const find = async (who: Parameters<typeof get>[0], q: string) =>
  ctx.app.inject({ url: `/v1/users/find?q=${encodeURIComponent(q)}`, headers: { authorization: `Bearer ${who.accessToken}` } });

describe("contact discovery", () => {
  it("gives every user a contact code and lets them replace it", async () => {
    const me = await signUp("coder");
    const user = await get(me, "/v1/me");
    expect(user.contactCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(user).toMatchObject({ username: null, findByEmail: true });

    const reset = (await call(me, "POST", "/v1/me/contact-code")).json();
    expect(reset.contactCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(reset.contactCode).not.toBe(user.contactCode);

    const other = await signUp("seeker");
    expect((await find(other, user.contactCode)).json().error.code).toBe("USER_NOT_FOUND");
    expect((await find(other, reset.contactCode)).json().user.id).toBe(me.user.id);
  });

  it("finds people by code, link, username and email without exposing the email", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const { contactCode } = await get(alice, "/v1/me");
    const handle = `alice_${Date.now().toString(36)}`.slice(0, 20);
    expect((await call(alice, "PATCH", "/v1/me", { username: `@${handle.toUpperCase()}` })).json().username).toBe(handle);
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: alice.user.id } });

    const queries = [
      contactCode,
      `${contactCode.slice(0, 4).toLowerCase()}-${contactCode.slice(4)}`,
      `https://six.example/add/${contactCode}`,
      `@${handle}`,
      handle,
      email.toUpperCase(),
    ];
    for (const q of queries) {
      const res = await find(bob, q);
      expect(res.statusCode, q).toBe(200);
      expect(res.json()).toEqual({
        user: { id: alice.user.id, displayName: expect.any(String), avatarUrl: null },
        username: handle,
        chatId: null,
      });
    }

    await call(alice, "PATCH", "/v1/me", { findByEmail: false });
    expect((await find(bob, email)).json().error.code).toBe("USER_NOT_FOUND");
    expect((await find(alice, contactCode)).json().error.code).toBe("CONTACT_SELF");
  });

  it("rejects taken, reserved and malformed usernames", async () => {
    const first = await signUp("first");
    const second = await signUp("second");
    const handle = `taken_${Date.now().toString(36)}`.slice(0, 20);
    await call(first, "PATCH", "/v1/me", { username: handle });

    expect((await call(second, "PATCH", "/v1/me", { username: handle })).json().error.code).toBe("USERNAME_TAKEN");
    expect((await call(second, "PATCH", "/v1/me", { username: "admin" })).json().error.code).toBe("USERNAME_TAKEN");
    expect((await call(second, "PATCH", "/v1/me", { username: "1abc" })).statusCode).toBe(400);
    expect((await call(first, "PATCH", "/v1/me", { username: null })).json().username).toBeNull();
  });

  it("adds a contact by opening a direct chat, once", async () => {
    const host = await signUp("adder");
    const guest = await signUp("added");
    const { contactCode } = await get(guest, "/v1/me");

    const added = await call(host, "POST", "/v1/contacts", { q: contactCode });
    expect(added.statusCode).toBe(200);
    const { chatId } = added.json();
    expect(added.json()).toMatchObject({ user: { id: guest.user.id }, customName: null });

    expect((await call(host, "POST", "/v1/contacts", { q: contactCode })).json().chatId).toBe(chatId);
    expect((await find(host, contactCode)).json().chatId).toBe(chatId);
    expect((await get(guest, "/v1/contacts")).items.map((c: { chatId: string }) => c.chatId)).toEqual([chatId]);

    const hidden = () =>
      prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId: host.user.id } } }).then((m) => m.hidden);
    await call(host, "DELETE", `/v1/chats/${chatId}?scope=me`);
    expect(await hidden()).toBe(true);
    await call(host, "POST", "/v1/contacts", { q: contactCode });
    expect(await hidden()).toBe(false);
  });

  it("removes a contact for both people, who can add each other again", async () => {
    const host = await signUp("remover");
    const guest = await signUp("removed");
    const { contactCode } = await get(guest, "/v1/me");
    const { chatId } = (await call(host, "POST", "/v1/contacts", { q: contactCode })).json();
    await send(host, chatId, "see you");
    await call(host, "PATCH", `/v1/contacts/${guest.user.id}`, { displayName: "Old friend" });
    await call(guest, "PATCH", `/v1/contacts/${host.user.id}`, { displayName: "Them" });

    expect((await call(host, "DELETE", `/v1/contacts/${guest.user.id}`)).statusCode).toBe(204);
    expect((await get(host, "/v1/contacts")).items).toEqual([]);
    expect((await get(guest, "/v1/contacts")).items).toEqual([]);
    expect((await get(guest, `/v1/chats/${chatId}`)).error.code).toBe("CHAT_NOT_FOUND");
    expect(await prisma.contactOverride.count({ where: { contactId: { in: [host.user.id, guest.user.id] } } })).toBe(0);

    const events = await prisma.changeEvent.findMany({ where: { payload: { path: ["chatId"], equals: chatId } } });
    expect(events.filter((e) => e.type === "message.new")).toEqual([]);
    expect(events.filter((e) => e.type === "chat.deleted").map((e) => e.userId).sort()).toEqual(
      [host.user.id, guest.user.id].sort(),
    );

    expect((await call(guest, "DELETE", `/v1/contacts/${host.user.id}`)).json().error.code).toBe("CONTACT_NOT_FOUND");

    const again = (await call(host, "POST", "/v1/contacts", { q: contactCode })).json();
    expect(again).toMatchObject({ user: { id: guest.user.id }, customName: null });
    expect(again.chatId).not.toBe(chatId);
    expect((await get(guest, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toEqual([host.user.id]);
  });
});
