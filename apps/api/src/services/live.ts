import { randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  type CreateLiveInput,
  DotsMove,
  type DotsState,
  EightsMove,
  type EightsState,
  FRITE_BOT_ID,
  FanoronaMove,
  type FanoronaState,
  LIVE_CHAT_LINES,
  MAX_REACTIONS_PER_USER,
  type LiveChatLineDTO,
  type LiveReactInput,
  type LiveReplyDTO,
  type LiveSayInput,
  LIVE_VOICE_MS,
  LIVE_SEATS,
  LIVE_TURN_SECONDS,
  type LiveGame,
  type LiveRoomDTO,
  type LiveView,
  type Locale,
  LudoMove,
  type LudoState,
  MarketMove,
  type MarketState,
  MemoryMove,
  type MemoryState,
  SnackMove,
  type SnackState,
  type PublicUser,
  WORDS_SECONDS,
  WordsMove,
  type WordsState,
  eightsAuto,
  eightsPlay,
  eightsStart,
  eightsView,
  ludoAuto,
  ludoForced,
  ludoPlay,
  ludoStart,
  wordsAuto,
  wordsPlay,
  wordsStart,
  wordsView,
  wordsWinners,
  dotsAuto,
  dotsScores,
  dotsPlay,
  dotsStart,
  fanoronaAuto,
  fanoronaPlay,
  fanoronaStart,
  marketAuto,
  marketPlay,
  marketScores,
  marketStart,
  marketView,
  snackAuto,
  snackPlay,
  snackScores,
  snackStart,
  memoryAuto,
  memoryScores,
  memoryPlay,
  memoryStart,
  memoryView,
  REFLEX_PAUSE_MS,
  REFLEX_ROUND_MS,
  ReflexMove,
  type ReflexState,
  reflexAuto,
  reflexBotDelay,
  reflexDeal,
  reflexPlay,
  reflexStart,
  reflexTimeout,
} from "@six/shared";
import type { User } from "../generated/prisma/client.js";
import { lexicon } from "../lib/lexicon.js";
import { withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { deleteObjects, presignGet } from "../lib/storage.js";
import { storeVoice } from "./ask.js";
import { blockedWith } from "./blocks.js";
import { profilesFor } from "./contacts.js";
import { sharedGif } from "./gifs.js";
import { postBotLiveResult } from "./bot.js";
import { createMessage, endLiveInvites } from "./messages.js";
import { deliverLiveInvitePush } from "./push.js";

type GameState =
  | { game: "ludo"; s: LudoState }
  | { game: "eights"; s: EightsState }
  | { game: "words"; s: WordsState }
  | { game: "fanorona"; s: FanoronaState }
  | { game: "dots"; s: DotsState }
  | { game: "memory"; s: MemoryState }
  | { game: "reflex"; s: ReflexState }
  | { game: "market"; s: MarketState }
  | { game: "snack"; s: SnackState };

interface Seat {
  /** null for Frite Bot. */
  userId: string | null;
  left: boolean;
  /** Gave up: the bot plays the seat out, but it can't win. */
  gaveUp: boolean;
}

interface Room {
  id: string;
  game: LiveGame;
  hostId: string;
  locale: Locale;
  status: LiveRoomDTO["status"];
  seats: Seat[];
  invited: string[];
  state: GameState | null;
  winners: number[];
  deadline: number | null;
  stalled: number | null;
  /** Set while nobody is in a game against the bot: the time left on Word Hunt's clock, 0 for the others. */
  paused: number | null;
  turnTimer: NodeJS.Timeout | null;
  roundTimers: NodeJS.Timeout[];
  users: Map<string, User>;
  profiles: Map<string, (u: User) => PublicUser>;
  chat: (Omit<LiveChatLineDTO, "user" | "at" | "replyTo"> & {
    userId: string;
    at: number;
    replyTo: (Omit<LiveReplyDTO, "user"> & { userId: string }) | null;
  })[];
  saidAt: Map<string, number>;
  voiceKeys: string[];
  touched: number;
}

/**
 * Rooms live in this process only.
 * ponytail: one API process, so a deploy or crash ends every game; keep rooms in Redis with a lock per
 * room if the API ever runs more than one instance.
 */
const live = new Map<string, Room>();

const BOT_MS = { ludo: 900, eights: 1300, fanorona: 1200, dots: 800, memory: 1100, words: 0, reflex: 0, market: 1000, snack: 1000 };
const IDLE_MS = 30 * 60 * 1000;

setInterval(() => {
  for (const room of live.values()) if (Date.now() - room.touched > IDLE_MS) close(room);
}, 60_000).unref();

const humans = (room: Room) => room.seats.flatMap((s) => (s.userId && !s.left ? [s.userId] : []));
const playsItself = (seat: Seat) => !seat.userId || seat.left || seat.gaveUp;

/** Each seat's score, in the games that keep one. */
function scoresOf(state: GameState) {
  if (state.game === "dots") return dotsScores(state.s);
  if (state.game === "memory") return memoryScores(state.s);
  if (state.game === "words") return wordsView(state.s, null).scores;
  if (state.game === "reflex") return state.s.scores;
  if (state.game === "market") return marketScores(state.s);
  if (state.game === "snack") return snackScores(state.s);
  return null;
}

function startState(room: Room): GameState {
  const n = room.seats.length;
  if (room.game === "ludo") return { game: "ludo", s: ludoStart(n) };
  if (room.game === "eights") return { game: "eights", s: eightsStart(n, Math.random) };
  if (room.game === "fanorona") return { game: "fanorona", s: fanoronaStart() };
  if (room.game === "dots") return { game: "dots", s: dotsStart(n) };
  if (room.game === "memory") return { game: "memory", s: memoryStart(n, Math.random) };
  if (room.game === "reflex") return { game: "reflex", s: reflexStart(n, Math.random) };
  if (room.game === "market") return { game: "market", s: marketStart(n, Math.random) };
  if (room.game === "snack") return { game: "snack", s: snackStart(n, Math.random) };
  return { game: "words", s: wordsStart(n, lexicon(room.locale), Math.random) };
}

function apply(state: GameState, seat: number, move: unknown): GameState | null {
  if (state.game === "ludo") {
    const m = LudoMove.safeParse(move);
    const s = m.success && ludoPlay(state.s, seat, m.data, Math.random);
    return s ? { game: "ludo", s } : null;
  }
  if (state.game === "eights") {
    const m = EightsMove.safeParse(move);
    const s = m.success && eightsPlay(state.s, seat, m.data, Math.random);
    return s ? { game: "eights", s } : null;
  }
  if (state.game === "fanorona") {
    const m = FanoronaMove.safeParse(move);
    const s = m.success && fanoronaPlay(state.s, seat, m.data);
    return s ? { game: "fanorona", s } : null;
  }
  if (state.game === "dots") {
    const m = DotsMove.safeParse(move);
    const s = m.success && dotsPlay(state.s, seat, m.data);
    return s ? { game: "dots", s } : null;
  }
  if (state.game === "memory") {
    const m = MemoryMove.safeParse(move);
    const s = m.success && memoryPlay(state.s, seat, m.data);
    return s ? { game: "memory", s } : null;
  }
  if (state.game === "reflex") {
    const m = ReflexMove.safeParse(move);
    const s = m.success && reflexPlay(state.s, seat, m.data);
    return s ? { game: "reflex", s } : null;
  }
  if (state.game === "market") {
    const m = MarketMove.safeParse(move);
    const s = m.success && marketPlay(state.s, seat, m.data, Math.random);
    return s ? { game: "market", s } : null;
  }
  if (state.game === "snack") {
    const m = SnackMove.safeParse(move);
    const s = m.success && snackPlay(state.s, seat, m.data, Math.random);
    return s ? { game: "snack", s } : null;
  }
  const m = WordsMove.safeParse(move);
  const s = m.success && wordsPlay(state.s, seat, m.data);
  return s ? { game: "words", s } : null;
}

function autoMove(state: GameState, seat: number) {
  if (state.game === "ludo") return ludoAuto(state.s, seat);
  if (state.game === "eights") return eightsAuto(state.s, seat);
  if (state.game === "fanorona") return fanoronaAuto(state.s, seat);
  if (state.game === "dots") return dotsAuto(state.s, seat);
  if (state.game === "memory") return memoryAuto(state.s, seat, Math.random);
  if (state.game === "reflex") return reflexAuto(state.s, seat, Math.random);
  if (state.game === "market") return marketAuto(state.s, seat, Math.random);
  if (state.game === "snack") return snackAuto(state.s, seat);
  return wordsAuto(state.s, seat, Math.random);
}

const turnOf = (state: GameState) => (state.game === "words" || state.game === "reflex" ? null : state.s.turn);

function winnersOf(state: GameState) {
  if (state.game === "words") return state.s.over ? wordsWinners(state.s) : null;
  if (state.game === "fanorona" || state.game === "dots" || state.game === "memory" || state.game === "reflex" || state.game === "market" || state.game === "snack")
    return state.s.winners;
  return state.s.winner === null ? null : [state.s.winner];
}

function viewOf(state: GameState, seat: number | null): LiveView {
  if (state.game === "ludo") return { game: "ludo", state: state.s };
  if (state.game === "eights") return { game: "eights", state: eightsView(state.s, seat) };
  if (state.game === "words") return { game: "words", state: wordsView(state.s, seat) };
  if (state.game === "memory") return { game: "memory", state: memoryView(state.s) };
  if (state.game === "reflex") return { game: "reflex", state: state.s };
  if (state.game === "market") return { game: "market", state: marketView(state.s) };
  if (state.game === "snack") return { game: "snack", state: state.s };
  return state.game === "fanorona" ? { game: "fanorona", state: state.s } : { game: "dots", state: state.s };
}

function toDTO(room: Room, viewerId: string): LiveRoomDTO {
  const profile = room.profiles.get(viewerId)!;
  const user = (id: string) => profile(room.users.get(id)!);
  const mySeat = room.seats.findIndex((s) => s.userId === viewerId && !s.left && !s.gaveUp);
  return {
    id: room.id,
    game: room.game,
    hostId: room.hostId,
    locale: room.locale,
    status: room.status,
    seats: room.seats.map((s) => ({ user: s.userId ? user(s.userId) : null, left: s.left, gaveUp: s.gaveUp })),
    invited: room.invited.map(user),
    mySeat: mySeat < 0 ? null : mySeat,
    deadline: room.deadline ? new Date(room.deadline).toISOString() : null,
    stalled: room.status === "playing" ? room.stalled : null,
    winners: room.winners,
    view: room.state && viewOf(room.state, mySeat < 0 ? null : mySeat),
    chat: room.chat
      .filter((l) => room.users.has(l.userId))
      .map(({ userId, at, replyTo, ...l }) => ({
        ...l,
        user: user(userId),
        at: new Date(at).toISOString(),
        replyTo:
          replyTo && room.users.has(replyTo.userId)
            ? { id: replyTo.id, text: replyTo.text, kind: replyTo.kind, user: user(replyTo.userId) }
            : null,
      })),
  };
}

function broadcast(room: Room) {
  room.touched = Date.now();
  const out = broadcaster();
  for (const id of humans(room)) out.to(rooms.user(id)).emit("live:room", toDTO(room, id));
}

/** Loads everyone in the room and how each of them sees the others: names stay hidden from strangers. */
async function refresh(room: Room) {
  const ids = [...new Set([...room.seats.flatMap((s) => (s.userId ? [s.userId] : [])), ...room.invited])];
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  room.users = new Map(users.map((u) => [u.id, u]));
  room.profiles = new Map(await Promise.all(ids.map(async (id) => [id, await profilesFor(prisma, id, ids)] as const)));
}

function clearTimers(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.roundTimers.forEach(clearTimeout);
  room.turnTimer = null;
  room.roundTimers = [];
}

function close(room: Room) {
  clearTimers(room);
  live.delete(room.id);
  void deleteObjects(room.voiceKeys).catch(() => null);
  void endLiveInvites(room.id).catch((err) => console.error("could not end the live game invites:", err.message));
  const out = broadcaster();
  const seated = room.seats.flatMap((s) => (s.userId ? [s.userId] : []));
  for (const id of [...seated, ...room.invited]) out.to(rooms.user(id)).emit("live:closed", { roomId: room.id });
}

/**
 * Ends the game: who won shows in the room until the next game or everyone leaves. Someone who played alone
 * against the bot also finds the result, and the score, in their chat with it.
 */
function finish(room: Room, ended: number[]) {
  const winners = ended.filter((i) => !room.seats[i]!.gaveUp);
  clearTimers(room);
  room.status = "over";
  room.winners = winners;
  room.deadline = null;
  broadcast(room);
  const people = room.seats.flatMap((s, i) => (s.userId ? [i] : []));
  if (people.length !== 1) return;
  const me = people[0]!;
  const result = !winners.includes(me) ? "lost" : winners.length > 1 ? "draw" : "won";
  const scores = scoresOf(room.state!);
  const score = scores && scores.length > 1 ? [scores[me]!, Math.max(...scores.filter((_, i) => i !== me))] : undefined;
  void postBotLiveResult(room.seats[me]!.userId!, room.locale, room.game, result, score).catch((err) =>
    console.error("could not post the live result in the bot's chat:", err.message),
  );
}

/**
 * After a move: ends the game, or hands the turn on, giving people a time limit and bots a short pause.
 * A Ludo move with nothing to pick is played after the same pause. Nobody plays for a person who runs out
 * of time: the game stalls until they move, or the others wait more or end it.
 */
function schedule(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
  const state = room.state!;
  const winners = winnersOf(state);
  if (winners) return finish(room, winners);
  const turn = turnOf(state);
  if (turn === null) return broadcast(room);
  const seat = room.seats[turn]!;
  const forced = state.game === "ludo" && ludoForced(state.s);
  const quick = playsItself(seat) || forced;
  const wait = quick ? BOT_MS[room.game] : LIVE_TURN_SECONDS * 1000;
  room.deadline = quick ? null : Date.now() + wait;
  room.stalled = null;
  room.turnTimer = setTimeout(() => {
    if (quick) return void act(room, turn, autoMove(room.state!, turn));
    room.turnTimer = null;
    room.stalled = turn;
    broadcast(room);
  }, wait);
  broadcast(room);
}

function act(room: Room, seat: number, move: unknown) {
  if (room.status !== "playing" || !room.state || move === null) return false;
  const next = apply(room.state, seat, move);
  if (!next) return false;
  room.state = next;
  if (next.game === "words") broadcast(room);
  else if (next.game === "reflex") reflexAfter(room);
  else schedule(room);
  return true;
}

/** Reflex: an item is up until someone finds it or time runs out, bots tapping about as fast as a person. */
function reflexRound(room: Room) {
  clearTimers(room);
  room.roundTimers.push(
    setTimeout(() => {
      if (room.state?.game !== "reflex") return;
      room.state = { game: "reflex", s: reflexTimeout(room.state.s) };
      reflexAfter(room);
    }, REFLEX_ROUND_MS),
  );
  room.seats.forEach((seat, i) => {
    if (!playsItself(seat)) return;
    room.roundTimers.push(
      setTimeout(() => {
        if (room.status === "playing" && room.state?.game === "reflex") act(room, i, autoMove(room.state, i));
      }, reflexBotDelay(Math.random)),
    );
  });
  broadcast(room);
}

/** After a tap or a timeout: the game ends at the goal, or once the round is decided the next item comes after a pause. */
function reflexAfter(room: Room) {
  if (room.state?.game !== "reflex") return;
  const { s } = room.state;
  if (s.winners) return finish(room, s.winners);
  broadcast(room);
  if (s.target) return;
  clearTimers(room);
  room.roundTimers.push(
    setTimeout(() => {
      if (room.status !== "playing" || room.state?.game !== "reflex") return;
      room.state = { game: "reflex", s: reflexDeal(room.state.s, Math.random) };
      reflexRound(room);
    }, REFLEX_PAUSE_MS),
  );
}

/** Word hunt: everyone plays at once until the clock runs out, bots finding a word every few seconds. */
function startRound(room: Room, ms = WORDS_SECONDS * 1000) {
  room.deadline = Date.now() + ms;
  room.roundTimers.push(
    setTimeout(() => {
      if (room.state?.game !== "words") return;
      room.state = { game: "words", s: { ...room.state.s, over: true } };
      finish(room, wordsWinners(room.state.s));
    }, ms),
  );
  room.seats.forEach((seat, i) => {
    if (!playsItself(seat)) return;
    const tick = () => {
      if (room.status !== "playing" || !room.state || !playsItself(seat)) return;
      act(room, i, autoMove(room.state, i));
      room.roundTimers.push(setTimeout(tick, 4000 + Math.random() * 5000));
    };
    room.roundTimers.push(setTimeout(tick, 3000 + Math.random() * 4000));
  });
  broadcast(room);
}

/** Stops every clock while nobody is left in the game, keeping what's left of Word Hunt's. */
function pause(room: Room) {
  room.paused = room.state?.game === "words" && room.deadline ? Math.max(0, room.deadline - Date.now()) : 0;
  room.deadline = null;
  clearTimers(room);
}

/** Starts the clocks again where `pause` stopped them. */
function resume(room: Room) {
  const left = room.paused ?? 0;
  room.paused = null;
  if (room.state?.game === "words") startRound(room, left);
  else if (room.state?.game === "reflex") room.state.s.target ? reflexRound(room) : reflexAfter(room);
  else schedule(room);
}

function roomOf(roomId: string) {
  const room = live.get(roomId);
  if (!room) throw new AppError("ROOM_NOT_FOUND", "This game has ended");
  return room;
}

function hostRoom(userId: string, roomId: string) {
  const room = roomOf(roomId);
  if (room.hostId !== userId) throw new AppError("FORBIDDEN", "Only the host can do that");
  return room;
}

/**
 * Opens a room with me in the first seat and asks my contacts to join: a banner in the app, a
 * notification, and the invite in our chat, sent silently since the notification already rang. With `bot`
 * it starts right away, with the bot in the seats the game needs.
 */
export async function createRoom(userId: string, input: CreateLiveInput) {
  const invite = input.bot ? [] : [...new Set(input.invite)].filter((id) => id !== userId && id !== FRITE_BOT_ID);
  if (invite.length >= LIVE_SEATS[input.game].max) throw new AppError("ROOM_FULL", "Too many people for this game");
  const blocked = await blockedWith(prisma, userId);
  const chats = await prisma.chat.findMany({
    where: { directKey: { in: invite.map((id) => [userId, id].sort().join(":")) } },
    select: { id: true, directKey: true },
  });
  const people = await prisma.user.count({ where: { id: { in: invite }, deletedAt: null, bannedAt: null } });
  const chatWith = (id: string) => chats.find((c) => c.directKey === [userId, id].sort().join(":"));
  const known = invite.every((id) => !blocked.has(id) && chatWith(id));
  if (!known || people !== invite.length) throw new AppError("CONTACT_NOT_FOUND", "You can only invite your contacts");
  const unfinished =
    myRooms(userId)[0] ??
    [...live.values()].flatMap((r) => (r.status !== "over" && r.invited.includes(userId) && invite.includes(r.hostId) ? [{ roomId: r.id, game: r.game }] : []))[0];
  if (unfinished) throw new AppError("GAME_IN_PROGRESS", "Finish your game first", { roomId: unfinished.roomId, game: unfinished.game });

  const room: Room = {
    id: randomBytes(9).toString("base64url"),
    game: input.game,
    hostId: userId,
    locale: input.locale,
    status: "lobby",
    seats: [{ userId, left: false, gaveUp: false }],
    invited: invite,
    state: null,
    winners: [],
    deadline: null,
    stalled: null,
    paused: null,
    turnTimer: null,
    roundTimers: [],
    users: new Map(),
    profiles: new Map(),
    chat: [],
    saidAt: new Map(),
    voiceKeys: [],
    touched: Date.now(),
  };
  await refresh(room);
  live.set(room.id, room);
  if (input.bot) {
    while (room.seats.length < LIVE_SEATS[room.game].min) room.seats.push({ userId: null, left: false, gaveUp: false });
    startRoom(userId, room.id);
  }
  const out = broadcaster();
  for (const id of invite) {
    const from = room.profiles.get(id)!(room.users.get(userId)!);
    out.to(rooms.user(id)).emit("live:invite", { roomId: room.id, game: room.game, from });
    void deliverLiveInvitePush(id, from, room.game, room.id).catch(() => null);
    const action = { type: "live_invite" as const, game: room.game, roomId: room.id, from: from.displayName };
    void withEvents((tx, emit) =>
      createMessage(tx, emit, userId, chatWith(id)!.id, { clientId: randomUUID(), action, silent: true }),
    ).catch(() => null);
  }
  return toDTO(room, userId);
}

/**
 * Takes an invited seat in the lobby, or Frite Bot's seat once the game started, or comes back to my
 * seat after a reconnect or leaving by mistake.
 */
export async function joinRoom(userId: string, roomId: string) {
  const room = roomOf(roomId);
  const mine = room.seats.find((s) => s.userId === userId);
  if (mine) {
    const back = mine.left;
    mine.left = false;
    if (back && room.paused !== null) {
      resume(room);
      return toDTO(room, userId);
    }
    const turn = room.status === "playing" && room.state ? turnOf(room.state) : null;
    if (back && turn !== null && (!room.turnTimer || room.seats[turn] === mine)) schedule(room);
    else broadcast(room);
    return toDTO(room, userId);
  }
  if (!room.invited.includes(userId)) throw new AppError("ROOM_NOT_FOUND", "This game has ended");
  await refresh(room);
  if (room.seats.some((s) => s.userId === userId)) return joinRoom(userId, roomId);
  const bot = room.status === "lobby" ? undefined : room.seats.find((s) => !s.userId);
  if (room.status !== "lobby" && !bot) throw new AppError("GAME_STARTED", "This game has already started");
  if (room.status === "lobby" && room.seats.length >= LIVE_SEATS[room.game].max) throw new AppError("ROOM_FULL", "This game is full");
  room.invited = room.invited.filter((id) => id !== userId);
  const seat = { userId, left: false, gaveUp: false };
  if (bot) Object.assign(bot, seat);
  else room.seats.push(seat);
  const turn = room.status === "playing" && room.state ? turnOf(room.state) : null;
  if (bot && turn !== null && room.seats[turn] === bot) schedule(room);
  else broadcast(room);
  return toDTO(room, userId);
}

/**
 * Leaves the lobby, closing it if I'm the host, or hands my seat to the bot during a game. Either way I
 * can come back: to the lobby through my invite, to the game through my seat. A game everyone left
 * waits, paused, until someone does or the idle sweep closes it.
 */
export function leaveRoom(userId: string, roomId: string) {
  const room = live.get(roomId);
  const seat = room?.seats.findIndex((s) => s.userId === userId && !s.left) ?? -1;
  if (!room || seat < 0) return;
  if (room.status === "lobby" && userId === room.hostId) return close(room);
  if (room.status === "lobby") {
    room.seats.splice(seat, 1);
    room.invited.push(userId);
  } else room.seats[seat]!.left = true;
  if (!humans(room).length) {
    if (room.status !== "playing") return close(room);
    return pause(room);
  }
  if (room.status === "playing" && room.state && turnOf(room.state) === seat) return schedule(room);
  broadcast(room);
}

export const hasRoom = (roomId: string) => live.has(roomId);

/** The app closed: the games I'm playing alone against the bot pause until I'm back. */
export function leaveSoloRooms(userId: string) {
  for (const room of [...live.values()]) {
    if (room.status === "playing" && humans(room).length === 1 && humans(room)[0] === userId) leaveRoom(userId, room.id);
  }
}

/** The games I have a seat in that haven't ended, even ones I left, so I can find my way back. */
export function myRooms(userId: string) {
  return [...live.values()].flatMap((r) =>
    r.status !== "over" && r.seats.some((s) => s.userId === userId && !s.gaveUp) ? [{ roomId: r.id, game: r.game }] : [],
  );
}

export function setBot(userId: string, roomId: string, add: boolean) {
  const room = hostRoom(userId, roomId);
  if (room.status !== "lobby") throw new AppError("GAME_STARTED", "This game has already started");
  if (add && room.seats.length >= LIVE_SEATS[room.game].max) throw new AppError("ROOM_FULL", "This game is full");
  const bot = room.seats.map((s) => !s.userId).lastIndexOf(true);
  if (add) room.seats.push({ userId: null, left: false, gaveUp: false });
  else if (bot >= 0) room.seats.splice(bot, 1);
  broadcast(room);
  return toDTO(room, userId);
}

/** Starts the game from the lobby, or a rematch with the same seats once it's over. */
export function startRoom(userId: string, roomId: string) {
  const room = hostRoom(userId, roomId);
  if (room.status === "playing") throw new AppError("GAME_STARTED", "This game has already started");
  if (room.seats.length < LIVE_SEATS[room.game].min) throw new AppError("VALIDATION_FAILED", "Not enough players");
  clearTimers(room);
  room.seats.forEach((s) => {
    s.gaveUp = false;
  });
  room.status = "playing";
  room.winners = [];
  room.state = startState(room);
  if (room.state.game === "words") startRound(room);
  else if (room.state.game === "reflex") reflexRound(room);
  else schedule(room);
  return toDTO(room, userId);
}

const kindOf = (l: Pick<Room["chat"][number], "gif" | "voice">): LiveReplyDTO["kind"] => (l.gif ? "gif" : l.voice ? "voice" : "text");

/** Says something to everyone in the room, a line a second at most, maybe in answer to one of its lines. */
export async function say(userId: string, { roomId, text, gifId, voice, replyTo }: LiveSayInput) {
  const room = roomOf(roomId);
  if (!room.seats.some((s) => s.userId === userId && !s.left)) throw new AppError("FORBIDDEN", "You're not in this game");
  if (Date.now() - (room.saidAt.get(userId) ?? 0) < 1000) throw new AppError("RATE_LIMITED", "Slow down");
  room.saidAt.set(userId, Date.now());
  const gif = gifId ? await sharedGif(gifId) : null;
  const sound = voice ? await storeVoice(`live/${room.id}`, Buffer.from(voice), LIVE_VOICE_MS) : null;
  if (sound) room.voiceKeys.push(sound.key);
  if (!live.has(room.id)) {
    if (sound) await deleteObjects([sound.key]);
    throw new AppError("ROOM_NOT_FOUND", "This game has ended");
  }
  const quoted = replyTo ? room.chat.find((l) => l.id === replyTo) : undefined;
  const line = {
    id: randomUUID(),
    userId,
    replyTo: quoted ? { id: quoted.id, userId: quoted.userId, text: quoted.text, kind: kindOf(quoted) } : null,
    text,
    gif: gif && { url: presignGet(gif.key), width: gif.width, height: gif.height },
    voice: sound && { url: presignGet(sound.key), durationMs: sound.durationMs, waveform: sound.waveform },
    at: Date.now(),
    reactions: [],
  };
  room.chat = [...room.chat, line].slice(-LIVE_CHAT_LINES);
  broadcast(room);
  return null;
}

/** Adds my reaction to a line of the room's chat, or takes it back when I already put that emoji there. */
export function react(userId: string, { roomId, lineId, emoji }: LiveReactInput) {
  const room = roomOf(roomId);
  if (!room.seats.some((s) => s.userId === userId && !s.left)) throw new AppError("FORBIDDEN", "You're not in this game");
  const line = room.chat.find((l) => l.id === lineId);
  if (!line) throw new AppError("MESSAGE_NOT_FOUND");
  const had = line.reactions.find((r) => r.emoji === emoji);
  if (had?.userIds.includes(userId)) had.userIds = had.userIds.filter((id) => id !== userId);
  else if (line.reactions.filter((r) => r.userIds.includes(userId)).length >= MAX_REACTIONS_PER_USER) {
    throw new AppError("VALIDATION_FAILED", "Too many reactions on this message");
  } else if (had) had.userIds.push(userId);
  else line.reactions.push({ emoji, userIds: [userId] });
  line.reactions = line.reactions.filter((r) => r.userIds.length);
  broadcast(room);
  return null;
}

/** Takes a seat out of the game: the bot plays it out but it can't win, and the last one still in wins. */
function forfeit(room: Room, seat: number) {
  room.seats[seat]!.gaveUp = true;
  const still = room.seats.flatMap((s, i) => (s.gaveUp ? [] : [i]));
  if (still.length <= 1) finish(room, still);
  else if (turnOf(room.state!) === seat) schedule(room);
  else broadcast(room);
}

function playingSeat(room: Room, userId: string) {
  const seat = room.seats.findIndex((s) => s.userId === userId && !s.left && !s.gaveUp);
  if (seat < 0 || room.status !== "playing" || !room.state) throw new AppError("FORBIDDEN", "You're not playing in this game");
  return seat;
}

/** Gives up my seat. */
export function giveUp(userId: string, roomId: string) {
  const room = roomOf(roomId);
  forfeit(room, playingSeat(room, userId));
  return null;
}

/** Someone else's turn ran out and I'd rather wait: their time starts again. */
export function waitForTurn(userId: string, roomId: string) {
  const room = roomOf(roomId);
  const seat = playingSeat(room, userId);
  if (room.stalled !== null && room.stalled !== seat) schedule(room);
  return null;
}

/** Someone else's turn ran out and I'd rather not wait: they're out, which ends a game of two. */
export function dropStalled(userId: string, roomId: string) {
  const room = roomOf(roomId);
  const seat = playingSeat(room, userId);
  if (room.stalled !== null && room.stalled !== seat) forfeit(room, room.stalled);
  return null;
}

/**
 * Ends the game for me in one go, even after I left it: gives up my seat and leaves for good. A game
 * nobody else is still in closes right away. Someone only invited turns the invite down, which closes a
 * lobby left waiting for nobody.
 */
export function endRoom(userId: string, roomId: string) {
  const room = live.get(roomId);
  const seat = room?.seats.find((s) => s.userId === userId);
  if (room && !seat && room.invited.includes(userId)) {
    room.invited = room.invited.filter((id) => id !== userId);
    if (room.status === "lobby" && !room.invited.length && humans(room).length <= 1) return close(room);
    return broadcast(room);
  }
  if (!room || !seat) return;
  if (room.status === "playing") {
    if (!room.seats.some((s) => s.userId && s !== seat && !s.gaveUp)) return close(room);
    seat.left = false;
    if (!seat.gaveUp) giveUp(userId, roomId);
  }
  leaveRoom(userId, roomId);
}

export function playMove(userId: string, roomId: string, move: unknown) {
  const room = roomOf(roomId);
  const seat = room.seats.findIndex((s) => s.userId === userId && !s.left && !s.gaveUp);
  if (seat < 0 || room.status !== "playing" || !room.state) throw new AppError("FORBIDDEN", "You're not playing in this game");
  const turn = turnOf(room.state);
  if (turn !== null && turn !== seat) throw new AppError("NOT_YOUR_TURN", "Wait for your turn");
  if (!act(room, seat, move)) throw new AppError("INVALID_MOVE", "You can't play that");
  return null;
}
