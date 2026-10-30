import type { AddressInfo } from "node:net";
import { type LiveInviteDTO, type LiveRoomDTO, ludoMovable } from "@six/shared";
import { type Socket, io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSocketServer } from "../src/socket/index.js";
import { type Auth, chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, makeFriends } = chatHelpers(ctx);

let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  createSocketServer(ctx.app.server);
  await ctx.app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});
afterAll(() => sockets.forEach((s) => s.disconnect()));

interface Player {
  socket: Socket;
  rooms: LiveRoomDTO[];
  invites: LiveInviteDTO[];
  ask: <T>(event: string, payload: object) => Promise<{ ok: boolean; data?: T; error?: { code: string } }>;
}

async function player(auth: Auth): Promise<Player> {
  const socket = connect(url, { auth: { token: auth.accessToken }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  const p: Player = {
    socket,
    rooms: [],
    invites: [],
    ask: (event, payload) => socket.timeout(5000).emitWithAck(event, payload),
  };
  socket.on("live:room", (r: LiveRoomDTO) => p.rooms.push(r));
  socket.on("live:invite", (i: LiveInviteDTO) => p.invites.push(i));
  return p;
}

const until = async (check: () => boolean, ms = 4000) => {
  for (const end = Date.now() + ms; !check(); ) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("live rooms", () => {
  it("invites a contact, deals hidden hands, and keeps turns", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];

    const created = await a.ask<LiveRoomDTO>("live:create", { game: "eights", invite: [guest.user.id], locale: "en" });
    expect(created.data!.invited).toHaveLength(1);
    await until(() => b.invites.length > 0);
    const roomId = b.invites[0]!.roomId;

    const joined = await b.ask<LiveRoomDTO>("live:join", { roomId });
    expect(joined.data!.mySeat).toBe(1);
    expect((await b.ask("live:start", { roomId })).error!.code).toBe("FORBIDDEN");
    await a.ask("live:bot", { roomId, add: true });

    const started = await a.ask<LiveRoomDTO>("live:start", { roomId });
    const view = started.data!.view!;
    expect(view.game).toBe("eights");
    if (view.game !== "eights") return;
    expect(view.state.hand).toHaveLength(5);
    expect(view.state.counts).toEqual([5, 5, 5]);
    expect(started.data!.deadline).not.toBeNull();

    expect((await b.ask("live:move", { roomId, move: { draw: true } })).error!.code).toBe("NOT_YOUR_TURN");
    expect((await a.ask("live:move", { roomId, move: { pass: true } })).error!.code).toBe("INVALID_MOVE");
    expect((await a.ask("live:move", { roomId, move: { draw: true } })).ok).toBe(true);
    expect((await a.ask("live:move", { roomId, move: { pass: true } })).ok).toBe(true);
    await until(() => b.rooms.some((r) => r.view?.game === "eights" && r.view.state.turn === 1));
    const seen = b.rooms.at(-1)!.view!;
    if (seen.game === "eights") expect(seen.state.hand).not.toEqual(view.state.hand);
  });

  it("only lets me invite my contacts", async () => {
    const [me, stranger] = [await signUp("me"), await signUp("stranger")];
    const p = await player(me);
    const res = await p.ask("live:create", { game: "ludo", invite: [stranger.user.id], locale: "en" });
    expect(res.error!.code).toBe("CONTACT_NOT_FOUND");
  });

  it("lets Frite Bot take its turns", async () => {
    const p = await player(await signUp("solo"));
    const { data } = await p.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [], locale: "en" });
    const roomId = data!.id;
    expect((await p.ask("live:start", { roomId })).error!.code).toBe("VALIDATION_FAILED");
    await p.ask("live:bot", { roomId, add: true });
    await p.ask("live:start", { roomId });
    for (let i = 0; i < 20; i++) {
      const view = p.rooms.at(-1)?.view;
      if (view?.game !== "ludo" || view.state.turn !== 0) break;
      const token = ludoMovable(view.state, 0, view.state.dice ?? 0)[0];
      await p.ask("live:move", { roomId, move: view.state.moving ? { token } : { roll: true } });
    }
    await until(() => p.rooms.some((r) => r.view?.game === "ludo" && r.view.state.rolledBy === 1));
    await p.ask("live:leave", { roomId });
    expect((await p.ask("live:move", { roomId, move: { roll: true } })).error!.code).toBe("ROOM_NOT_FOUND");
  });

  it("checks word hunt words against the grid and the dictionary", async () => {
    const p = await player(await signUp("words"));
    const { data } = await p.ask<LiveRoomDTO>("live:create", { game: "words", invite: [], locale: "en" });
    const started = await p.ask<LiveRoomDTO>("live:start", { roomId: data!.id });
    const view = started.data!.view!;
    expect(view.game === "words" && view.state.grid).toHaveLength(16);
    expect((await p.ask("live:move", { roomId: data!.id, move: { word: "QQQQ" } })).error!.code).toBe("INVALID_MOVE");
    await p.ask("live:leave", { roomId: data!.id });
  });
});
