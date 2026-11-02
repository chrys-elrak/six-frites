import { randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  type CreateLiveInput,
  DotsMove,
  type DotsState,
  EightsMove,
  type EightsState,
  FanoronaMove,
  type FanoronaState,
  LIVE_CHAT_LINES,
  type LiveChatLineDTO,
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
  MemoryMove,
  type MemoryState,
  type PublicUser,
  type ServiceAction,
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
  dotsPlay,
  dotsStart,
  fanoronaAuto,
  fanoronaPlay,
  fanoronaStart,
  memoryAuto,
  memoryPlay,
  memoryStart,
  memoryView,
} from "@six/shared";
import type { User } from "../generated/prisma/client.js";
import { lexicon } from "../lib/lexicon.js";
import { withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { deleteObjects, presignGet } from "../lib/storage.js";
import { storeVoice } from "./ask.js";
import { blockedWith } from "./blocks.js";
import { GAMES_ACCOUNT } from "./chats.js";
import { profilesFor } from "./contacts.js";
import { sharedGif } from "./gifs.js";
import { createMessage } from "./messages.js";
import { deliverLiveInvitePush } from "./push.js";

type GameState =
  | { game: "ludo"; s: LudoState }
  | { game: "eights"; s: EightsState }
  | { game: "words"; s: WordsState }
  | { game: "fanorona"; s: FanoronaState }
  | { game: "dots"; s: DotsState }
  | { game: "memory"; s: MemoryState };

interface Seat {
  /** null for Frite Bot. */
  userId: string | null;
  left: boolean;
  /** Ran out of time, so the bot finishes their turn for them. */
  away: boolean;
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
  turnTimer: NodeJS.Timeout | null;
  roundTimers: NodeJS.Timeout[];
  users: Map<string, User>;
  profiles: Map<string, (u: User) => PublicUser>;
  chat: (Omit<LiveChatLineDTO, "user" | "at"> & { userId: string; at: number })[];
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

const BOT_MS = { ludo: 900, eights: 1300, fanorona: 1200, dots: 800, memory: 1100, words: 0 };
const IDLE_MS = 30 * 60 * 1000;

setInterval(() => {
  for (const room of live.values()) if (Date.now() - room.touched > IDLE_MS) close(room);
}, 60_000).unref();

const humans = (room: Room) => room.seats.flatMap((s) => (s.userId && !s.left ? [s.userId] : []));
const playsItself = (seat: Seat) => !seat.userId || seat.left || seat.away || seat.gaveUp;

function startState(room: Room): GameState {
  const n = room.seats.length;
  if (room.game === "ludo") return { game: "ludo", s: ludoStart(n) };
  if (room.game === "eights") return { game: "eights", s: eightsStart(n, Math.random) };
  if (room.game === "fanorona") return { game: "fanorona", s: fanoronaStart() };
  if (room.game === "dots") return { game: "dots", s: dotsStart(n) };
  if (room.game === "memory") return { game: "memory", s: memoryStart(n, Math.random) };
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
  return wordsAuto(state.s, seat, Math.random);
}

const turnOf = (state: GameState) => (state.game === "words" ? null : state.s.turn);

function winnersOf(state: GameState) {
  if (state.game === "words") return state.s.over ? wordsWinners(state.s) : null;
  if (state.game === "fanorona" || state.game === "dots" || state.game === "memory") return state.s.winners;
  return state.s.winner === null ? null : [state.s.winner];
}

function viewOf(state: GameState, seat: number | null): LiveView {
  if (state.game === "ludo") return { game: "ludo", state: state.s };
  if (state.game === "eights") return { game: "eights", state: eightsView(state.s, seat) };
  if (state.game === "words") return { game: "words", state: wordsView(state.s, seat) };
  if (state.game === "memory") return { game: "memory", state: memoryView(state.s) };
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
    winners: room.winners,
    view: room.state && viewOf(room.state, mySeat < 0 ? null : mySeat),
    chat: room.chat
      .filter((l) => room.users.has(l.userId))
      .map(({ userId, at, ...l }) => ({ ...l, user: user(userId), at: new Date(at).toISOString() })),
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
  const out = broadcaster();
  const seated = room.seats.flatMap((s) => (s.userId ? [s.userId] : []));
  for (const id of [...seated, ...room.invited]) out.to(rooms.user(id)).emit("live:closed", { roomId: room.id });
}

/** Posts in someone's games inbox, their chat with Six Frites Games, without a notification of its own. */
async function postToInbox(userId: string, action: ServiceAction) {
  const app = await prisma.user.upsert({
    where: { googleSub: GAMES_ACCOUNT.googleSub },
    create: GAMES_ACCOUNT,
    update: {},
    select: { id: true },
  });
  const directKey = `games:${userId}`;
  await withEvents(async (tx, emit) => {
    const chat = await tx.chat.upsert({
      where: { directKey },
      create: { directKey, type: "games", members: { create: [{ userId: app.id }, { userId }] } },
      update: {},
      select: { id: true },
    });
    return createMessage(tx, emit, app.id, chat.id, { clientId: randomUUID(), action, silent: true });
  });
}

/** Ends the game and, when it was only me against Frite Bot, posts how it went in my games inbox. */
function finish(room: Room, ended: number[]) {
  const winners = ended.filter((i) => !room.seats[i]!.gaveUp);
  clearTimers(room);
  room.status = "over";
  room.winners = winners;
  room.deadline = null;
  broadcast(room);
  if (room.seats.filter((s) => s.userId).length > 1) return;
  room.seats.forEach((s, i) => {
    if (!s.userId || s.left) return;
    const outcome = !winners.includes(i) ? "lost" : winners.length > 1 ? "tie" : "won";
    void postToInbox(s.userId, { type: "live_result", game: room.game, outcome }).catch(() => null);
  });
}

/**
 * After a move: ends the game, or hands the turn on, giving people a time limit and bots a short pause.
 * A Ludo move with nothing to pick is played after the same pause, and whoever ran out of time gets
 * their full time back once their turn is over.
 */
function schedule(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
  const state = room.state!;
  const winners = winnersOf(state);
  if (winners) return finish(room, winners);
  const turn = turnOf(state);
  if (turn === null) return broadcast(room);
  for (const [i, other] of room.seats.entries()) if (i !== turn) other.away = false;
  const seat = room.seats[turn]!;
  const forced = state.game === "ludo" && ludoForced(state.s);
  const quick = playsItself(seat) || forced;
  const wait = quick ? BOT_MS[room.game] : LIVE_TURN_SECONDS * 1000;
  room.deadline = quick ? null : Date.now() + wait;
  room.turnTimer = setTimeout(() => {
    if (!forced) seat.away ||= !!seat.userId;
    act(room, turn, autoMove(room.state!, turn));
  }, wait);
  broadcast(room);
}

function act(room: Room, seat: number, move: unknown) {
  if (room.status !== "playing" || !room.state || move === null) return false;
  const next = apply(room.state, seat, move);
  if (!next) return false;
  room.state = next;
  if (next.game === "words") broadcast(room);
  else schedule(room);
  return true;
}

/** Word hunt: everyone plays at once until the clock runs out, bots finding a word every few seconds. */
function startRound(room: Room) {
  room.deadline = Date.now() + WORDS_SECONDS * 1000;
  room.roundTimers.push(
    setTimeout(() => {
      if (room.state?.game !== "words") return;
      room.state = { game: "words", s: { ...room.state.s, over: true } };
      finish(room, wordsWinners(room.state.s));
    }, WORDS_SECONDS * 1000),
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
 * notification, and the invite in our chat, sent silently since the notification already rang.
 */
export async function createRoom(userId: string, input: CreateLiveInput) {
  const invite = [...new Set(input.invite)].filter((id) => id !== userId);
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

  const room: Room = {
    id: randomBytes(9).toString("base64url"),
    game: input.game,
    hostId: userId,
    locale: input.locale,
    status: "lobby",
    seats: [{ userId, left: false, away: false, gaveUp: false }],
    invited: invite,
    state: null,
    winners: [],
    deadline: null,
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
    const back = mine.left || mine.away;
    mine.left = false;
    mine.away = false;
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
  const seat = { userId, left: false, away: false, gaveUp: false };
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
    if (room.state?.game !== "words") clearTimers(room);
    return;
  }
  if (room.status === "playing" && room.state && turnOf(room.state) === seat) return schedule(room);
  broadcast(room);
}

export const hasRoom = (roomId: string) => live.has(roomId);

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
  if (add) room.seats.push({ userId: null, left: false, away: false, gaveUp: false });
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
    s.away = false;
    s.gaveUp = false;
  });
  room.status = "playing";
  room.winners = [];
  room.state = startState(room);
  if (room.state.game === "words") startRound(room);
  else schedule(room);
  return toDTO(room, userId);
}

/** Says something to everyone in the room, a line a second at most. */
export async function say(userId: string, { roomId, text, gifId, voice }: LiveSayInput) {
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
  const line = {
    userId,
    text,
    gif: gif && { url: presignGet(gif.key), width: gif.width, height: gif.height },
    voice: sound && { url: presignGet(sound.key), durationMs: sound.durationMs, waveform: sound.waveform },
    at: Date.now(),
  };
  room.chat = [...room.chat, line].slice(-LIVE_CHAT_LINES);
  broadcast(room);
  return null;
}

/** Gives up my seat: the bot plays it out but it can't win, and the last one still in wins. */
export function giveUp(userId: string, roomId: string) {
  const room = roomOf(roomId);
  const seat = room.seats.findIndex((s) => s.userId === userId && !s.left && !s.gaveUp);
  if (seat < 0 || room.status !== "playing" || !room.state) throw new AppError("FORBIDDEN", "You're not playing in this game");
  room.seats[seat]!.gaveUp = true;
  const still = room.seats.flatMap((s, i) => (s.gaveUp ? [] : [i]));
  if (still.length <= 1) finish(room, still);
  else if (turnOf(room.state) === seat) schedule(room);
  else broadcast(room);
  return null;
}

/**
 * Ends the game for me in one go, even after I left it: gives up my seat and leaves for good. A game
 * nobody else is still in closes right away.
 */
export function endRoom(userId: string, roomId: string) {
  const room = live.get(roomId);
  const seat = room?.seats.find((s) => s.userId === userId);
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
  room.seats[seat]!.away = false;
  if (!act(room, seat, move)) throw new AppError("INVALID_MOVE", "You can't play that");
  return null;
}
