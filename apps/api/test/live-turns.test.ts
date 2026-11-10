import type { AddressInfo } from "node:net";
import type { LiveRoomDTO } from "@six/shared";
import { type Socket, io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSocketServer } from "../src/socket/index.js";
import { type Auth, chatHelpers, useApp } from "./helpers.js";

vi.mock("@six/shared", async (original) => ({ ...(await original<object>()), LIVE_TURN_SECONDS: 0.3 }));

const ctx = useApp();
const { makeFriends } = chatHelpers(ctx);

let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  createSocketServer(ctx.app.server);
  await ctx.app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});
afterAll(() => sockets.forEach((s) => s.disconnect()));

async function player(auth: Auth) {
  const socket = connect(url, { auth: { token: auth.accessToken }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  const rooms: LiveRoomDTO[] = [];
  const closed: string[] = [];
  socket.on("live:room", (r: LiveRoomDTO) => rooms.push(r));
  socket.on("live:closed", (e: { roomId: string }) => closed.push(e.roomId));
  const ask = <T>(event: string, payload: object): Promise<{ ok: boolean; data?: T; error?: { code: string; details?: unknown } }> =>
    socket.timeout(5000).emitWithAck(event, payload);
  return { rooms, closed, ask, last: () => rooms.at(-1)! };
}

const until = async (check: () => boolean, ms = 4000) => {
  for (const end = Date.now() + ms; !check(); ) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("live turns", () => {
  it("won't let the person invited start a second game with the same friend, until they turn the first down", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const first = (await a.ask<LiveRoomDTO>("live:create", { game: "dots", invite: [guest.user.id], locale: "en" })).data!;

    const second = await b.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [host.user.id], locale: "en" });
    expect(second.error).toMatchObject({ code: "GAME_IN_PROGRESS", details: { roomId: first.id, game: "dots" } });

    await b.ask("live:end", { roomId: first.id });
    await until(() => a.closed.includes(first.id));
    const again = await b.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [host.user.id], locale: "en" });
    expect(again.ok).toBe(true);
    await b.ask("live:end", { roomId: again.data!.id });
  });

  it("doesn't play for someone whose time ran out: the other one waits more, or ends the game", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const room = (await a.ask<LiveRoomDTO>("live:create", { game: "dots", invite: [guest.user.id], locale: "en" })).data!;
    await b.ask("live:join", { roomId: room.id });
    await a.ask("live:start", { roomId: room.id });

    await until(() => b.last().stalled !== null);
    const stalled = b.last().stalled!;
    const [idle, waiting] = stalled === 0 ? [a, b] : [b, a];
    expect(waiting.last().view).toEqual(b.rooms.find((r) => r.status === "playing")!.view);
    expect((await idle.ask("live:drop", { roomId: room.id })).ok).toBe(true);
    expect(waiting.last().status).toBe("playing");

    await waiting.ask("live:wait", { roomId: room.id });
    await until(() => waiting.last().stalled === null && waiting.last().deadline !== null);
    await until(() => waiting.last().stalled === stalled);

    await waiting.ask("live:drop", { roomId: room.id });
    await until(() => waiting.last().status === "over");
    expect(waiting.last().winners).toEqual([1 - stalled]);
    await a.ask("live:leave", { roomId: room.id });
    await b.ask("live:leave", { roomId: room.id });
  });
});
