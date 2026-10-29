import { z } from "zod";
import { Id } from "./common.js";
import { DeviceEnvelope, EnvelopeJSON } from "./e2ee.js";

const CallId = z.string().min(8).max(64);

/** Relays call signalling to the other person's devices (and your own, so they stop ringing). */
export const CallSignalInput = z.object({
  chatId: Id,
  callId: CallId,
  envelopes: z.array(DeviceEnvelope).min(1).max(50).describe("The signal sealed for each device"),
});
export type CallSignalInput = z.infer<typeof CallSignalInput>;

/** One signal as delivered to one device. Nothing is stored: devices that are offline miss it. */
export const CallSignalDTO = z.object({
  chatId: Id,
  callId: CallId,
  fromUserId: Id,
  fromDeviceId: Id,
  envelope: EnvelopeJSON,
});
export type CallSignalDTO = z.infer<typeof CallSignalDTO>;

const IceCandidate = z.object({
  candidate: z.string().max(2000),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
});

export const CALL_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🎉", "🔥", "👏"] as const;
export type CallReaction = (typeof CALL_REACTIONS)[number];

export const CALL_GAMES = ["rps", "dice", "guess"] as const;
export type CallGame = (typeof CALL_GAMES)[number];

/** A two-player round where both pick in secret and the picks are compared once both are in, as one side sees it. */
export interface Duel<T> {
  round: number;
  mine: T | null;
  theirs: T | null;
  wins: number;
  losses: number;
}

/** 1 when `a` wins, -1 when it loses, 0 for a draw. */
type Outcome<T> = (a: T, b: T) => number;

export const newDuel = <T>(): Duel<T> => ({ round: 1, mine: null, theirs: null, wins: 0, losses: 0 });

function settle<T>(g: Duel<T>, outcome: Outcome<T>): Duel<T> {
  if (!g.mine || !g.theirs) return g;
  const o = outcome(g.mine, g.theirs);
  return { ...g, wins: g.wins + (o === 1 ? 1 : 0), losses: g.losses + (o === -1 ? 1 : 0) };
}

/** Plays my pick this round; null when I already have. */
export const duelPick = <T>(g: Duel<T>, pick: T, outcome: Outcome<T>) =>
  g.mine ? null : settle({ ...g, mine: pick }, outcome);

/**
 * Takes their pick for `round`; null for a stale or repeated one. A later round means they moved on
 * after the last result, so this side follows.
 * ponytail: picks are sent in the clear inside the encrypted call, so a modified client could wait and
 * peek; commit to a hash first and reveal after if it ever matters.
 */
export function duelReceive<T>(g: Duel<T>, round: number, pick: T, outcome: Outcome<T>): Duel<T> | null {
  if (round < g.round || (round === g.round && g.theirs)) return null;
  const current = round > g.round ? { ...g, round, mine: null, theirs: null } : g;
  return settle({ ...current, theirs: pick }, outcome);
}

export const duelNext = <T>(g: Duel<T>): Duel<T> => ({ ...g, round: g.round + 1, mine: null, theirs: null });

export const RPS_HANDS = ["rock", "paper", "scissors"] as const;
export type RpsHand = (typeof RPS_HANDS)[number];
export const RPS_EMOJI: Record<RpsHand, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
const BEATS: Record<RpsHand, RpsHand> = { rock: "scissors", paper: "rock", scissors: "paper" };

export const rpsOutcome: Outcome<RpsHand> = (a, b) => (a === b ? 0 : BEATS[a] === b ? 1 : -1);

/** A number from 1 to 6, and a random share of the roll so neither side decides it alone. */
export interface DicePick {
  pick: number;
  seed: number;
}

export const diceRoll = (a: DicePick, b: DicePick) => ((a.seed + b.seed) % 6) + 1;

/** Whoever picked closer to the roll wins. */
export const diceOutcome: Outcome<DicePick> = (a, b) => {
  const roll = diceRoll(a, b);
  const da = Math.abs(a.pick - roll);
  const db = Math.abs(b.pick - roll);
  return da === db ? 0 : da < db ? 1 : -1;
};

export const GUESS_MAX = 100;
export type GuessHint = "higher" | "lower" | "right";

/**
 * Guess the number, as one side sees it. The chooser keeps `secret` and answers each try; the
 * guesser only ever sees the hints, so the number stays on the chooser's device until it's found.
 */
export interface GuessGame {
  round: number;
  secret: number | null;
  ready: boolean;
  tries: { n: number; hint: GuessHint | null }[];
}

export const NEW_GUESS: GuessGame = { round: 1, secret: null, ready: false, tries: [] };

/** The caller picks the number on odd rounds and the other person on even ones. */
export const guessChooser = (round: number, outgoing: boolean) => (round % 2 === 1) === outgoing;

export const guessSolved = (g: GuessGame) => g.tries.some((t) => t.hint === "right");

export const guessSetSecret = (g: GuessGame, secret: number): GuessGame | null =>
  g.ready ? null : { ...g, secret, ready: true };

/** The guesser hears that the number is picked, following into a later round if the other side moved on. */
export function guessOnReady(g: GuessGame, round: number): GuessGame | null {
  if (round < g.round || (round === g.round && g.ready)) return null;
  return { round, secret: null, ready: true, tries: round > g.round ? [] : g.tries };
}

/** The guesser tries a number; null while the last try waits for its hint, or once it's found. */
export function guessTry(g: GuessGame, n: number): GuessGame | null {
  if (!g.ready || g.secret !== null || guessSolved(g) || g.tries.some((t) => !t.hint)) return null;
  return { ...g, tries: [...g.tries, { n, hint: null }] };
}

export const guessHint = (secret: number, n: number): GuessHint => (n === secret ? "right" : n < secret ? "higher" : "lower");

/** The chooser answers a try; null when it isn't for this round. */
export function guessOnTry(g: GuessGame, round: number, n: number): { game: GuessGame; hint: GuessHint } | null {
  if (round !== g.round || g.secret === null || guessSolved(g)) return null;
  const hint = guessHint(g.secret, n);
  return { game: { ...g, tries: [...g.tries, { n, hint }] }, hint };
}

export function guessOnHint(g: GuessGame, round: number, n: number, hint: GuessHint): GuessGame | null {
  const i = g.tries.findIndex((t) => t.n === n && !t.hint);
  if (round !== g.round || i < 0) return null;
  return { ...g, tries: g.tries.map((t, j) => (j === i ? { n, hint } : t)) };
}

/** The numbers the hints so far still allow. */
export function guessRange(g: GuessGame) {
  let lo = 1;
  let hi = GUESS_MAX;
  for (const t of g.tries) {
    if (t.hint === "higher") lo = Math.max(lo, t.n + 1);
    if (t.hint === "lower") hi = Math.min(hi, t.n - 1);
  }
  return { lo, hi };
}

export const guessNext = (g: GuessGame): GuessGame => ({ round: g.round + 1, secret: null, ready: false, tries: [] });

const Round = z.number().int().min(1);
const Guess = z.number().int().min(1).max(GUESS_MAX);

/**
 * What a signal says, inside its envelope. `chatId` and `callId` bind it to one call. `offer`
 * rings; `answer` picks up (other devices of the callee then stop ringing on `answered`);
 * `ice` trickles connection candidates; `reject`, `busy` and `hangup` end it. `reaction` floats
 * an emoji up the other screen; `game` shows the other side the game picked, and `rps`, `dice`
 * and the `guess` ones play it.
 */
export const CallSignal = z
  .object({
    v: z.literal(1),
    kind: z.literal("call"),
    chatId: Id,
    callId: CallId,
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("offer"), sdp: z.string().max(20_000), video: z.boolean() }),
      z.object({ type: z.literal("answer"), sdp: z.string().max(20_000) }),
      z.object({ type: z.literal("ice"), candidate: IceCandidate }),
      z.object({ type: z.literal("ringing") }),
      z.object({ type: z.literal("answered") }),
      z.object({ type: z.literal("reject") }),
      z.object({ type: z.literal("busy") }),
      z.object({ type: z.literal("hangup") }),
      z.object({ type: z.literal("video"), on: z.boolean() }),
      z.object({ type: z.literal("reaction"), emoji: z.enum(CALL_REACTIONS) }),
      z.object({ type: z.literal("game"), game: z.enum(CALL_GAMES) }),
      z.object({ type: z.literal("rps"), round: Round, hand: z.enum(RPS_HANDS) }),
      z.object({ type: z.literal("dice"), round: Round, pick: z.number().int().min(1).max(6), seed: z.number().int().min(0).max(5) }),
      z.object({ type: z.literal("guessReady"), round: Round }),
      z.object({ type: z.literal("guessTry"), round: Round, n: Guess }),
      z.object({ type: z.literal("guessHint"), round: Round, n: Guess, hint: z.enum(["higher", "lower", "right"]) }),
    ]),
  );
export type CallSignal = z.infer<typeof CallSignal>;

export const IceServersDTO = z.object({
  iceServers: z.array(
    z.object({
      urls: z.array(z.string()),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
  ttlSeconds: z.number().int().describe("Fetch new credentials after this long"),
});
export type IceServersDTO = z.infer<typeof IceServersDTO>;

export const LogCallInput = z.object({
  callId: CallId,
  video: z.boolean(),
  durationSecs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60)
    .nullable()
    .describe("How long it lasted once answered; null when nobody picked up"),
});
export type LogCallInput = z.infer<typeof LogCallInput>;
