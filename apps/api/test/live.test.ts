import { execFileSync, spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { type ChatDTO, type LiveInviteDTO, type LiveRoomDTO, fanoronaOptions, ludoMovable } from "@six/shared";
import { type Socket, io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSocketServer } from "../src/socket/index.js";
import { type Auth, chatHelpers, useApp } from "./helpers.js";

const hasFfmpeg = hasFfmpegCheck();
const ctx = useApp();
const { signUp, get, makeFriends } = chatHelpers(ctx);

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

async function player(auth: Auth, at = url): Promise<Player> {
  const socket = connect(at, { auth: { token: auth.accessToken }, transports: ["websocket"], forceNew: true });
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
  it("plays across API instances: the room's instance answers players connected to the other one", async () => {
    const other = spawn(process.execPath, ["--import", "tsx", "test/second-instance.ts"], { stdio: ["ignore", "pipe", "inherit"] });
    try {
      const port = await new Promise<string>((resolve) => other.stdout.on("data", (d) => /listening (\d+)/.test(String(d)) && resolve(RegExp.$1)));
      const { host, guest } = await makeFriends();
      const [a, b] = [await player(host), await player(guest, `http://127.0.0.1:${port}`)];
      const { data } = await a.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [guest.user.id], locale: "en" });
      expect((await b.ask("live:mine", {})).data).toEqual([]);
      expect((await b.ask<LiveRoomDTO>("live:join", { roomId: data!.id })).data!.mySeat).toBe(1);
      expect((await b.ask("live:mine", {})).data).toEqual([{ roomId: data!.id, game: "ludo" }]);
      await a.ask("live:start", { roomId: data!.id });
      await until(() => b.rooms.some((r) => r.status === "playing"));
      expect((await b.ask("live:move", { roomId: data!.id, move: { roll: true } })).error!.code).toBe("NOT_YOUR_TURN");
      expect((await b.ask("live:join", { roomId: "gone" })).error!.code).toBe("ROOM_NOT_FOUND");
      await b.ask("live:leave", { roomId: data!.id });
      await a.ask("live:leave", { roomId: data!.id });
    } finally {
      other.kill();
    }
  }, 30_000);

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

  it("posts invites in our chat, and nothing else after the game", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const { data } = await a.ask<LiveRoomDTO>("live:create", { game: "fanorona", invite: [guest.user.id], locale: "en" });
    const chats = async () => (await get(guest, "/v1/chats")).items as ChatDTO[];
    let direct: ChatDTO | undefined;
    for (const end = Date.now() + 4000; !direct && Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
      direct = (await chats()).find((c) => c.lastMessage?.action?.type === "live_invite");
    }
    expect(direct!.lastMessage).toMatchObject({
      type: "service",
      silent: true,
      senderId: host.user.id,
      action: { type: "live_invite", game: "fanorona", roomId: data!.id },
    });

    const solo = (await b.ask<LiveRoomDTO>("live:create", { game: "fanorona", invite: [], locale: "en" })).data!;
    await b.ask("live:bot", { roomId: solo.id, add: true });
    await b.ask("live:start", { roomId: solo.id });
    await b.ask("live:giveup", { roomId: solo.id });
    await until(() => b.rooms.some((r) => r.id === solo.id && r.status === "over"));
    await new Promise((r) => setTimeout(r, 300));
    expect((await chats()).map((c) => c.id)).toEqual([direct!.id]);
  });

  it("lets the players chat in the room, a line a second at most", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const { data } = await a.ask<LiveRoomDTO>("live:create", { game: "dots", invite: [guest.user.id], locale: "en" });
    const roomId = data!.id;
    expect((await b.ask("live:say", { roomId, text: "hi" })).error!.code).toBe("FORBIDDEN");
    await b.ask("live:join", { roomId });

    expect((await b.ask("live:say", { roomId, text: "  hello  " })).ok).toBe(true);
    expect((await b.ask("live:say", { roomId, text: "again" })).error!.code).toBe("RATE_LIMITED");
    expect((await a.ask("live:say", { roomId, text: "" })).ok).toBe(false);
    await until(() => a.rooms.some((r) => r.chat.length > 0));
    expect(a.rooms.at(-1)!.chat).toMatchObject([{ user: { id: guest.user.id }, text: "hello", reactions: [] }]);

    const lineId = a.rooms.at(-1)!.chat[0]!.id;
    const reactions = () => b.rooms.at(-1)!.chat[0]!.reactions;
    expect((await a.ask("live:react", { roomId, lineId, emoji: "nope" })).ok).toBe(false);
    expect((await a.ask("live:react", { roomId, lineId: "gone", emoji: "😂" })).error!.code).toBe("MESSAGE_NOT_FOUND");
    expect((await a.ask("live:react", { roomId, lineId, emoji: "😂" })).ok).toBe(true);
    expect((await b.ask("live:react", { roomId, lineId, emoji: "😂" })).ok).toBe(true);
    await until(() => reactions()[0]?.userIds.length === 2);
    expect(reactions()).toEqual([{ emoji: "😂", userIds: [host.user.id, guest.user.id] }]);
    await a.ask("live:react", { roomId, lineId, emoji: "😂" });
    await b.ask("live:react", { roomId, lineId, emoji: "😂" });
    await until(() => reactions().length === 0);

    await new Promise((r) => setTimeout(r, 1000));
    expect((await a.ask("live:say", { roomId, text: "hi back", replyTo: lineId })).ok).toBe(true);
    await until(() => b.rooms.at(-1)!.chat.length === 2);
    expect(b.rooms.at(-1)!.chat[1]!.replyTo).toEqual({ id: lineId, user: expect.objectContaining({ id: guest.user.id }), text: "hello", kind: "text" });
    expect(b.rooms.at(-1)!.chat[0]!.replyTo).toBeNull();
    await a.ask("live:leave", { roomId });
  });

  it("lets a player give up: the other one wins, or the rest play on", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const duel = (await a.ask<LiveRoomDTO>("live:create", { game: "fanorona", invite: [guest.user.id], locale: "en" })).data!;
    await b.ask("live:join", { roomId: duel.id });
    expect((await b.ask("live:giveup", { roomId: duel.id })).error!.code).toBe("FORBIDDEN");
    await a.ask("live:start", { roomId: duel.id });
    expect((await b.ask("live:giveup", { roomId: duel.id })).ok).toBe(true);
    await until(() => a.rooms.at(-1)?.status === "over");
    expect(a.rooms.at(-1)!.winners).toEqual([0]);

    const table = (await a.ask<LiveRoomDTO>("live:create", { game: "dots", invite: [guest.user.id], locale: "en" })).data!;
    await b.ask("live:join", { roomId: table.id });
    await a.ask("live:bot", { roomId: table.id, add: true });
    await a.ask("live:start", { roomId: table.id });
    expect((await a.ask("live:giveup", { roomId: table.id })).ok).toBe(true);
    await until(() => b.rooms.some((r) => r.id === table.id && r.seats[0]!.gaveUp));
    const seen = b.rooms.filter((r) => r.id === table.id).at(-1)!;
    expect(seen.status).toBe("playing");
    expect(a.rooms.filter((r) => r.id === table.id).at(-1)!.mySeat).toBeNull();
    expect((await a.ask("live:move", { roomId: table.id, move: { line: 0 } })).error!.code).toBe("FORBIDDEN");
    await b.ask("live:leave", { roomId: table.id });
    await a.ask("live:leave", { roomId: table.id });
  });

  it.skipIf(!hasFfmpeg)("keeps the first 30 seconds of a voice note said in the room", async () => {
    const p = await player(await signUp("talker"));
    const { data } = await p.ask<LiveRoomDTO>("live:create", { game: "words", invite: [], locale: "en" });
    const clip = execFileSync("ffmpeg", [
      ...["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=40"],
      ...["-c:a", "libopus", "-b:a", "16k", "-f", "webm", "pipe:1"],
    ]);
    expect((await p.ask("live:say", { roomId: data!.id, voice: clip, gifId: "cat1" })).ok).toBe(false);
    expect((await p.ask("live:say", { roomId: data!.id, voice: clip })).ok).toBe(true);
    await until(() => p.rooms.some((r) => r.chat.length > 0));
    const { voice } = p.rooms.at(-1)!.chat[0]!;
    expect(voice!.durationMs).toBeGreaterThan(29_000);
    expect(voice!.durationMs).toBeLessThanOrEqual(30_000);
    expect((await fetch(voice!.url)).ok).toBe(true);

    await p.ask("live:leave", { roomId: data!.id });
    await new Promise((r) => setTimeout(r, 300));
    expect((await fetch(voice!.url)).ok).toBe(false);
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
    expect((await p.ask("live:move", { roomId, move: { roll: true } })).error!.code).toBe("FORBIDDEN");
  });

  it("keeps my seat when I leave by mistake, and lets me back in", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const solo = (await a.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [], locale: "en" })).data!;
    await a.ask("live:bot", { roomId: solo.id, add: true });
    await a.ask("live:start", { roomId: solo.id });
    await a.ask("live:leave", { roomId: solo.id });
    await new Promise((r) => setTimeout(r, 1500));
    const paused = a.rooms.filter((r) => r.id === solo.id).at(-1)!;
    expect((await a.ask("live:mine", {})).data).toEqual([{ roomId: solo.id, game: "ludo" }]);
    const back = await a.ask<LiveRoomDTO>("live:join", { roomId: solo.id });
    expect(back.data).toMatchObject({ status: "playing", mySeat: 0, view: paused.view });
    expect(back.data!.deadline).not.toBeNull();

    const lobby = (await a.ask<LiveRoomDTO>("live:create", { game: "dots", invite: [guest.user.id], locale: "en" })).data!;
    await b.ask("live:join", { roomId: lobby.id });
    await b.ask("live:leave", { roomId: lobby.id });
    expect((await b.ask<LiveRoomDTO>("live:join", { roomId: lobby.id })).data!.mySeat).toBe(1);
    await a.ask("live:leave", { roomId: solo.id });
    await a.ask("live:leave", { roomId: lobby.id });
  });

  it("ends a game in one go, even one I left: it closes, or the others play on without me", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const solo = (await a.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [], locale: "en" })).data!;
    await a.ask("live:bot", { roomId: solo.id, add: true });
    await a.ask("live:start", { roomId: solo.id });
    await a.ask("live:leave", { roomId: solo.id });
    expect((await a.ask("live:end", { roomId: solo.id })).ok).toBe(true);
    expect((await a.ask("live:mine", {})).data).toEqual([]);
    expect((await a.ask("live:join", { roomId: solo.id })).error!.code).toBe("ROOM_NOT_FOUND");

    const duel = (await a.ask<LiveRoomDTO>("live:create", { game: "fanorona", invite: [guest.user.id], locale: "en" })).data!;
    await b.ask("live:join", { roomId: duel.id });
    await a.ask("live:start", { roomId: duel.id });
    expect((await b.ask("live:end", { roomId: duel.id })).ok).toBe(true);
    await until(() => a.rooms.at(-1)?.status === "over");
    expect(a.rooms.at(-1)!.winners).toEqual([0]);
    expect((await b.ask("live:mine", {})).data).toEqual([]);
    await a.ask("live:leave", { roomId: duel.id });
  });

  it("lets someone invited late take Frite Bot's seat, or says the game started without them", async () => {
    const { host, guest } = await makeFriends();
    const [a, b] = [await player(host), await player(guest)];
    const ludo = (await a.ask<LiveRoomDTO>("live:create", { game: "ludo", invite: [guest.user.id], locale: "en" })).data!;
    await a.ask("live:bot", { roomId: ludo.id, add: true });
    await a.ask("live:bot", { roomId: ludo.id, add: true });
    await a.ask("live:start", { roomId: ludo.id });
    const twice = await Promise.all([1, 2].map(() => b.ask<LiveRoomDTO>("live:join", { roomId: ludo.id })));
    for (const late of twice) {
      expect(late.data).toMatchObject({
        status: "playing",
        mySeat: 1,
        seats: [{ user: { id: host.user.id } }, { user: { id: guest.user.id } }, { user: null }],
      });
    }

    const words = (await a.ask<LiveRoomDTO>("live:create", { game: "words", invite: [guest.user.id], locale: "en" })).data!;
    await a.ask("live:start", { roomId: words.id });
    expect((await b.ask("live:join", { roomId: words.id })).error!.code).toBe("GAME_STARTED");
    for (const id of [ludo.id, words.id]) await a.ask("live:leave", { roomId: id });
    await b.ask("live:leave", { roomId: ludo.id });
  });

  it("plays Fanorona, Dots and Boxes and Memory against Frite Bot, two at most for Fanorona", async () => {
    const { host, guest } = await makeFriends();
    const p = await player(host);
    const tooMany = await p.ask("live:create", { game: "fanorona", invite: [guest.user.id, host.user.id, "x"], locale: "en" });
    expect(tooMany.ok).toBe(false);
    for (const game of ["fanorona", "dots", "memory"] as const) {
      const { data } = await p.ask<LiveRoomDTO>("live:create", { game, invite: [], locale: "en" });
      await p.ask("live:bot", { roomId: data!.id, add: true });
      if (game === "fanorona") expect((await p.ask("live:bot", { roomId: data!.id, add: true })).error!.code).toBe("ROOM_FULL");
      const started = await p.ask<LiveRoomDTO>("live:start", { roomId: data!.id });
      expect(started.data!.view!.game).toBe(game);
      const view = started.data!.view!;
      const move =
        view.game === "fanorona"
          ? (({ from, to, approach }) => ({ from, to, take: approach.length ? "approach" : "withdraw" }))(fanoronaOptions(view.state, 0)[0]!)
          : game === "dots"
            ? { line: 0 }
            : { card: 0 };
      expect((await p.ask("live:move", { roomId: data!.id, move })).ok).toBe(true);
      await p.ask("live:leave", { roomId: data!.id });
    }
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

function hasFfmpegCheck() {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
