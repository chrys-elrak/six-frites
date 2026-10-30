import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { type Auth, chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call, send } = chatHelpers(ctx);

const admin = async (): Promise<Auth> => (await loginAs(ctx.app, "the-admin")).json();
const walkIn = async (name: string, extra: Record<string, unknown> = {}): Promise<Auth & { user: { guest: boolean } }> =>
  (await loginAs(ctx.app, uniqueSub(name), "web", { support: true, ...extra })).json();
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

  it("lets a guest join by signing in again with an invite", async () => {
    const boss = await admin();
    const sub = uniqueSub("returning");
    const guest: Auth & { user: { guest: boolean } } = (await loginAs(ctx.app, sub, "web", { support: true })).json();
    expect(guest.user.guest).toBe(true);
    expect((await loginAs(ctx.app, sub)).json().error.code).toBe("INVITE_REQUIRED");

    const { code } = (await call(boss, "POST", "/v1/invites", {})).json();
    const joined = (await loginAs(ctx.app, sub, "web", { inviteCode: code })).json();
    expect(joined.user).toMatchObject({ id: guest.user.id, guest: false });
  });
});
