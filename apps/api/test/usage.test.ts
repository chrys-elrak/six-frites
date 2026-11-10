import type { AddressInfo } from "node:net";
import { io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSocketServer } from "../src/socket/index.js";
import { asAdmin, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { get, signUp } = chatHelpers(ctx);
let url: string;

beforeAll(async () => {
  createSocketServer(ctx.app.server);
  await ctx.app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});
afterAll(() => vi.restoreAllMocks());

describe("usage", () => {
  it("adds up someone's API calls and the time they spend on each screen", async () => {
    const me = await signUp("busy-user");
    const boss = await asAdmin(ctx.app);
    await get(me, "/v1/me");
    await get(me, "/v1/me");

    const socket = connect(url, { auth: { token: me.accessToken }, transports: ["websocket"], forceNew: true });
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const beat = async (p: object, wait: number) => {
      socket.emit("presence", p);
      await new Promise((r) => setTimeout(r, 50));
      now += wait;
    };
    await beat({ active: true, page: "/chats/:id" }, 15_000);
    await beat({ active: true, page: "javascript:alert(1)" }, 5_000);
    await beat({ active: true, page: "/settings" }, 10_000);
    await beat({ active: true }, 4_000);
    await beat({ active: false }, 1_000);
    vi.restoreAllMocks();
    socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    const usage = await get(boss, `/v1/admin/users/${me.user.id}/usage?days=7`);
    expect(usage.days).toHaveLength(7);
    expect(usage.days.at(-1).seconds).toBe(34);
    expect(usage.pages).toEqual([
      { page: "/chats/:id", seconds: 20 },
      { page: "/settings", seconds: 14 },
    ]);
    expect(usage.calls).toContainEqual({ name: "GET /v1/me", count: 2 });
    expect(usage.hours.reduce((a: number, b: number) => a + b, 0)).toBe(34);
  });
});
