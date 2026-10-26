import { describe, expect, it } from "vitest";
import { type Auth, bearer, chatHelpers, loginAs, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send, makeFriends } = chatHelpers(ctx);

const chat = (who: Auth, chatId: string) => get(who, `/v1/chats/${chatId}`);

describe("blocking", () => {
  it("shows both sides, stops sending, reacting and editing both ways, and lifts on unblock", async () => {
    const { host, guest, chatId } = await makeFriends();
    const hello = (await send(guest, chatId, "hello")).json();
    const mine = (await send(host, chatId, "hi")).json();

    expect((await call(host, "POST", `/v1/users/${guest.user.id}/block`)).statusCode).toBe(204);
    expect(await chat(host, chatId)).toMatchObject({ blockedByMe: true, blockedByThem: false, peerDeleted: false });
    expect(await chat(guest, chatId)).toMatchObject({ blockedByMe: false, blockedByThem: true });

    const blockedSend = await send(guest, chatId, "why?");
    expect(blockedSend.statusCode).toBe(403);
    expect(blockedSend.json().error).toMatchObject({ code: "CHAT_BLOCKED", message: "This person blocked you" });
    expect((await send(host, chatId, "bye")).json().error.code).toBe("CHAT_BLOCKED");
    expect((await call(guest, "POST", `/v1/messages/${mine.id}/reactions`, { emoji: "👍" })).json().error.code).toBe(
      "CHAT_BLOCKED",
    );
    expect((await call(guest, "PATCH", `/v1/messages/${hello.id}`, { text: "edited" })).json().error.code).toBe(
      "CHAT_BLOCKED",
    );
    expect((await call(guest, "PATCH", `/v1/chats/${chatId}`, { autoDeleteSecs: 3600 })).json().error.code).toBe(
      "CHAT_BLOCKED",
    );
    expect((await call(guest, "PATCH", `/v1/chats/${chatId}`, { muted: true })).statusCode).toBe(200);

    const blocks = await get(host, "/v1/me/blocks");
    expect(blocks.items).toEqual([{ user: expect.objectContaining({ id: guest.user.id }), createdAt: expect.any(String) }]);
    expect((await get(guest, `/v1/presence?ids=${host.user.id}`)).items).toEqual([]);

    expect((await call(host, "DELETE", `/v1/users/${guest.user.id}/block`)).statusCode).toBe(204);
    expect(await chat(guest, chatId)).toMatchObject({ blockedByMe: false, blockedByThem: false });
    expect((await send(guest, chatId, "friends again")).statusCode).toBe(201);
  });

  it("only blocks people you share a chat with", async () => {
    const { host } = await makeFriends();
    const { guest: stranger } = await makeFriends();
    expect((await call(host, "POST", `/v1/users/${stranger.user.id}/block`)).json().error.code).toBe("USER_NOT_FOUND");
    expect((await call(host, "POST", `/v1/users/${host.user.id}/block`)).statusCode).toBe(400);
  });
});

describe("account deletion", () => {
  it("signs out, anonymises the person, keeps their messages for the other side and frees the Google account", async () => {
    const { host, guest, chatId } = await makeFriends();
    const { id } = (await send(guest, chatId, "remember me")).json();
    await call(guest, "PATCH", "/v1/me", { username: `gone_${Date.now().toString(36)}`.slice(0, 20) });
    const { contactCode } = await get(guest, "/v1/me");
    const { googleSub } = await prisma.user.findUniqueOrThrow({ where: { id: guest.user.id } });

    expect((await call(guest, "DELETE", "/v1/me", { confirm: "nope" })).statusCode).toBe(400);
    expect((await call(guest, "DELETE", "/v1/me", { confirm: "DELETE" })).statusCode).toBe(204);

    expect((await ctx.app.inject({ url: "/v1/me", headers: bearer(guest.accessToken) })).statusCode).toBe(401);
    const seen = await chat(host, chatId);
    expect(seen).toMatchObject({ peerDeleted: true, title: "Deleted account" });
    expect((await get(host, `/v1/chats/${chatId}/messages`)).items.map((m: { id: string }) => m.id)).toContain(id);
    expect((await send(host, chatId, "hello?")).json().error.code).toBe("ACCOUNT_DELETED");
    expect((await get(host, "/v1/contacts")).items).toEqual([]);
    expect((await get(host, `/v1/users/find?q=${contactCode}`)).error.code).toBe("USER_NOT_FOUND");

    const again = (await loginAs(ctx.app, googleSub.replace(/^google:/, ""))).json();
    expect(again.user.id).not.toBe(guest.user.id);
    expect(again.user.displayName).not.toBe("Deleted account");
  });
});
