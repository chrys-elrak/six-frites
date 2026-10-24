import { describe, expect, it } from "vitest";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call } = chatHelpers(ctx);

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
});
