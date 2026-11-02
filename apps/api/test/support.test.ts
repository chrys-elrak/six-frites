import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { pairAlias } from "../src/services/users.js";
import { type Auth, chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send } = chatHelpers(ctx);

const admin = async (): Promise<Auth> => (await loginAs(ctx.app, "the-admin")).json();
const walkIn = async (name: string, extra: Record<string, unknown> = {}): Promise<Auth & { user: { guest: boolean } }> =>
  (await loginAs(ctx.app, uniqueSub(name), "web", { guest: true, ...extra })).json();
const openSupport = async (who: Auth) => (await call(who, "POST", "/v1/support")).json();

beforeAll(() => void (env.INVITE_ONLY = true));
afterAll(() => void (env.INVITE_ONLY = false));

describe("support chat", () => {
  it("lets someone without an invite in as a guest who can only write to support", async () => {
    const refused = await loginAs(ctx.app, uniqueSub("walk-in"));
    expect(refused.json().error.code).toBe("INVITE_REQUIRED");

    const guest = await walkIn("guest");
    expect(guest.user.guest).toBe(true);
    expect((await get(guest, "/v1/me")).guest).toBe(true);
    for (const url of ["/v1/chats", "/v1/contacts", "/v1/devices"]) {
      expect((await get(guest, url)).error.code).toBe("FORBIDDEN");
    }
    expect((await call(guest, "POST", "/v1/invites", {})).statusCode).toBe(403);

    const boss = await admin();
    const chat = await openSupport(guest);
    expect(chat.support).toBe(true);
    expect((await openSupport(guest)).id).toBe(chat.id);
    const listed = async () => (await get(boss, "/v1/chats")).items.some((c: { id: string }) => c.id === chat.id);
    expect(await listed()).toBe(false);

    expect((await send(guest, chat.id, "Hello, can I join?")).statusCode).toBe(201);
    expect(await listed()).toBe(true);
    expect((await get(guest, `/v1/chats/${chat.id}/messages`)).items).toHaveLength(1);

    const location = { location: { lat: -18.9, lng: 47.5 } };
    expect((await send(guest, chat.id, "I am here", location)).statusCode).toBe(400);
    expect((await send(boss, chat.id, "Look", { effect: "confetti" })).statusCode).toBe(400);
    expect((await send(boss, chat.id, "Sure, here's a link")).statusCode).toBe(201);
  });

  it("turns a guest into a member when they use an invite", async () => {
    const boss = await admin();
    const guest = await walkIn("joiner");
    const chat = await openSupport(guest);
    await send(guest, chat.id, "Hi");
    const { code } = (await call(boss, "POST", "/v1/invites", {})).json();

    expect((await call(guest, "POST", `/v1/invites/${code}/accept`)).statusCode).toBe(200);
    expect((await get(guest, "/v1/me")).guest).toBe(false);
    const chats = (await get(guest, "/v1/chats")).items;
    expect(chats.find((c: { id: string }) => c.id === chat.id).support).toBe(false);
  });

  it("shows support as Six Frites to the person helped, labels it for the admin, and keeps it apart from personal chats", async () => {
    const boss = await admin();
    const guest = await walkIn("asker");
    const chat = await openSupport(guest);
    expect(chat).toMatchObject({ title: "Six Frites", supportDesk: false });
    const agent = chat.members.find((m: { user: { id: string } }) => m.user.id !== guest.user.id).user;
    expect(agent).toMatchObject({ id: boss.user.id, displayName: "Six Frites", avatarUrl: expect.stringMatching(/icon-192\.png$/) });

    await send(guest, chat.id, "Hello?");
    const desk = await get(boss, `/v1/chats/${chat.id}`);
    expect(desk.supportDesk).toBe(true);
    expect(desk.title).toBe(pairAlias(boss.user.id, guest.user.id, "Potato"));

    const { code } = (await call(boss, "POST", "/v1/invites", {})).json();
    const friend: Auth = (await loginAs(ctx.app, uniqueSub("friend"), "web", { inviteCode: code })).json();
    const personal = (await get(friend, "/v1/chats")).items as { id: string; title: string }[];
    const help = await openSupport(friend);
    expect(personal.map((c) => c.id)).not.toContain(help.id);
    expect(help).toMatchObject({ title: "Six Frites", withSupport: true });
    await send(friend, help.id, "Hi");
    const seen = ((await get(boss, "/v1/chats")).items as { id: string; title: string; members: { user: { id: string } }[] }[])
      .filter((c) => c.members.some((m) => m.user.id === friend.user.id))
      .map((c) => [c.id === help.id, c.title]);
    expect(Object.fromEntries(seen)).toEqual({
      false: pairAlias(boss.user.id, friend.user.id),
      true: pairAlias(boss.user.id, friend.user.id, "Potato"),
    });

    const friendsInvite = (await call(friend, "POST", "/v1/invites", {})).json().code;
    const stranger: Auth = (await loginAs(ctx.app, uniqueSub("stranger"), "web", { inviteCode: friendsInvite })).json();
    await openSupport(stranger);
    const presence = async (who: Auth, id: string) =>
      (await get(who, `/v1/presence?ids=${id}`)).items.map((p: { userId: string }) => p.userId);
    expect(await presence(stranger, boss.user.id)).toEqual([]);
    expect(await presence(boss, stranger.user.id)).toEqual([stranger.user.id]);
    expect((await get(friend, "/v1/contacts")).items.map((c: { chatId: string }) => c.chatId)).not.toContain(help.id);
  });

  it("lets a guest send support a photo, but no other file", async () => {
    const guest = await walkIn("screenshot");
    const chat = await openSupport(guest);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const presign = (body: object) => call(guest, "POST", "/v1/uploads/presign", body);

    expect((await presign({ kind: "file", mime: "application/pdf", size: 5, name: "a.pdf" })).statusCode).toBe(403);
    expect((await presign({ kind: "image", mime: "image/png", size: 101 * 1024 * 1024, name: "big.png" })).statusCode).toBe(403);
    const started = await presign({ kind: "image", mime: "image/png", size: png.length, name: "bug.png" });
    expect(started.statusCode, started.body).toBe(201);
    const { url, headers, upload } = started.json();
    expect((await fetch(url, { method: "PUT", body: new Uint8Array(png), headers })).ok).toBe(true);
    expect((await call(guest, "POST", `/v1/uploads/${upload.id}/complete`)).statusCode).toBe(200);

    const sent = await send(guest, chat.id, undefined as unknown as string, { attachmentId: upload.id });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json().attachment.kind).toBe("image");
  });

  it("lets a guest join by signing in again with an invite", async () => {
    const boss = await admin();
    const sub = uniqueSub("returning");
    const guest: Auth & { user: { guest: boolean } } = (await loginAs(ctx.app, sub, "web", { guest: true })).json();
    expect(guest.user.guest).toBe(true);
    expect((await loginAs(ctx.app, sub)).json().error.code).toBe("INVITE_REQUIRED");

    const { code } = (await call(boss, "POST", "/v1/invites", {})).json();
    const joined = (await loginAs(ctx.app, sub, "web", { inviteCode: code })).json();
    expect(joined.user).toMatchObject({ id: guest.user.id, guest: false });
  });

  it("lets support close a conversation, which opens again when someone writes", async () => {
    const boss = await admin();
    const guest = await walkIn("closer");
    const chat = await openSupport(guest);
    await send(guest, chat.id, "It works now, thanks");
    const close = (who: Auth) => call(who, "POST", `/v1/chats/${chat.id}/support/close`);

    expect((await close(guest)).statusCode).toBe(403);
    const closed = (await close(boss)).json();
    expect(closed).toMatchObject({ archived: true, supportDesk: true });
    expect(closed.supportClosedAt).not.toBeNull();
    expect((await openSupport(guest)).supportClosedAt).toBe(closed.supportClosedAt);

    await send(guest, chat.id, "Actually, one more thing");
    expect(await get(boss, `/v1/chats/${chat.id}`)).toMatchObject({ archived: false, supportClosedAt: null });
  });
});
