import { describe, expect, it } from "vitest";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send } = chatHelpers(ctx);

const find = async (who: Parameters<typeof get>[0], q: string) =>
  ctx.app.inject({ url: `/v1/users/find?q=${encodeURIComponent(q)}`, headers: { authorization: `Bearer ${who.accessToken}` } });

describe("contact discovery", () => {
  it("gives every user a contact code and lets them replace it without losing contacts", async () => {
    const me = await signUp("coder");
    const user = await get(me, "/v1/me");
    expect(user.contactCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    const friend = await signUp("friend");
    expect((await call(friend, "POST", "/v1/contacts", { q: user.contactCode })).statusCode).toBe(200);

    const reset = (await call(me, "POST", "/v1/me/contact-code")).json();
    expect(reset.contactCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(reset.contactCode).not.toBe(user.contactCode);

    const other = await signUp("seeker");
    expect((await find(other, user.contactCode)).json().error.code).toBe("USER_NOT_FOUND");
    expect((await find(other, reset.contactCode)).json().user.id).toBe(me.user.id);
    expect((await get(friend, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toContain(me.user.id);
  });

  it("finds people only by contact code or link", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const { contactCode } = await get(alice, "/v1/me");
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: alice.user.id } });

    const queries = [
      contactCode,
      `${contactCode.slice(0, 4).toLowerCase()}-${contactCode.slice(4)}`,
      `https://six.example/add/${contactCode}`,
    ];
    for (const q of queries) {
      const res = await find(bob, q);
      expect(res.statusCode, q).toBe(200);
      expect(res.json()).toEqual({
        user: { id: alice.user.id, displayName: expect.stringMatching(/^Frite \d{4}$/), avatarUrl: null },
        chatId: null,
      });
    }

    expect((await find(bob, email)).json().error.code).toBe("USER_NOT_FOUND");
    expect((await find(alice, contactCode)).json().error.code).toBe("CONTACT_SELF");
  });

  it("adds a contact by opening a direct chat, once", async () => {
    const host = await signUp("adder");
    const guest = await signUp("added");
    const code = async () => (await get(guest, "/v1/me")).contactCode as string;

    const added = await call(host, "POST", "/v1/contacts", { q: await code() });
    expect(added.statusCode).toBe(200);
    const { chatId } = added.json();
    expect(added.json()).toMatchObject({ user: { id: guest.user.id }, customName: null });

    expect((await call(host, "POST", "/v1/contacts", { q: await code() })).json().chatId).toBe(chatId);
    expect((await find(host, await code())).json().chatId).toBe(chatId);
    expect((await get(guest, "/v1/contacts")).items.map((c: { chatId: string }) => c.chatId)).toEqual([chatId]);

    const hidden = () =>
      prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId: host.user.id } } }).then((m) => m.hidden);
    await call(host, "DELETE", `/v1/chats/${chatId}?scope=me`);
    expect(await hidden()).toBe(true);
    await call(host, "POST", "/v1/contacts", { q: await code() });
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

    const again = (await call(host, "POST", "/v1/contacts", { q: (await get(guest, "/v1/me")).contactCode })).json();
    expect(again).toMatchObject({ user: { id: guest.user.id }, customName: null });
    expect(again.chatId).not.toBe(chatId);
    expect((await get(guest, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toEqual([host.user.id]);
  });

  it("changes a contact code once someone adds you with it, so it can't be passed on", async () => {
    const owner = await signUp("owner");
    const first = await signUp("first");
    const second = await signUp("second");
    const { contactCode } = await get(owner, "/v1/me");

    expect((await find(second, contactCode)).statusCode).toBe(200);
    expect((await call(first, "POST", "/v1/contacts", { q: contactCode })).statusCode).toBe(200);
    expect((await call(second, "POST", "/v1/contacts", { q: contactCode })).json().error.code).toBe("USER_NOT_FOUND");

    const fresh = (await get(owner, "/v1/me")).contactCode;
    expect(fresh).not.toBe(contactCode);
    const updated = await prisma.changeEvent.findFirst({ where: { userId: owner.user.id, type: "me.updated" } });
    expect(updated?.payload).toMatchObject({ id: owner.user.id, contactCode: fresh });
    expect((await call(second, "POST", "/v1/contacts", { q: fresh })).statusCode).toBe(200);
  });

  it("lets only one of two people racing for the same contact code add you", async () => {
    const owner = await signUp("raced");
    const racers = [await signUp("racer-a"), await signUp("racer-b")];
    const { contactCode } = await get(owner, "/v1/me");
    const results = await Promise.all(racers.map((r) => call(r, "POST", "/v1/contacts", { q: contactCode })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
  });

  it("lets anyone add you with a contact link until it expires or you delete it", async () => {
    const owner = await signUp("linker");
    const [a, b, late] = [await signUp("link-a"), await signUp("link-b"), await signUp("link-late")];
    const codes = async () => (await get(owner, "/v1/me/contact-links")).items.map((l: { code: string }) => l.code);
    const { contactCode } = await get(owner, "/v1/me");

    const forever = (await call(owner, "POST", "/v1/me/contact-links", { expiresAt: null })).json();
    expect(forever).toMatchObject({ code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{8}$/), expiresAt: null });
    for (const who of [a, b]) {
      const added = await call(who, "POST", "/v1/contacts", { q: `https://six.example/add/${forever.code}` });
      expect(added.json().user.id).toBe(owner.user.id);
    }
    expect((await get(owner, "/v1/me")).contactCode).toBe(contactCode);

    const soon = (await call(owner, "POST", "/v1/me/contact-links", { expiresAt: new Date(Date.now() + 6e4).toISOString() })).json();
    expect(await codes()).toEqual([soon.code, forever.code]);
    await prisma.contactLink.update({ where: { code: soon.code }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await find(late, soon.code)).json().error.code).toBe("USER_NOT_FOUND");
    expect(await codes()).toEqual([forever.code]);

    expect((await call(owner, "DELETE", `/v1/me/contact-links/${forever.code}`)).statusCode).toBe(204);
    expect((await find(late, forever.code)).json().error.code).toBe("USER_NOT_FOUND");
    expect((await get(a, "/v1/contacts")).items.map((c: { user: { id: string } }) => c.user.id)).toEqual([owner.user.id]);

    const past = await call(owner, "POST", "/v1/me/contact-links", { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(past.statusCode).toBe(400);
  });
});
