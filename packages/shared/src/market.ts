import { z } from "zod";
import { shuffle } from "./eights.js";

/** The pictures on the die, and on each player's cards, one card each. */
export const MARKET_FACES = ["🍅", "🥕", "🥦", "🌽", "🍞", "🧀"];
const CARDS = MARKET_FACES.length;
/** How likely Frite Bot is to remember one of its cards it has seen. */
const RECALL = 0.7;

export interface MarketState {
  /** Each seat's cards, the picture under each, in its own order. */
  hands: string[][];
  /** Which of each seat's cards are found, so stay face up. */
  found: boolean[][];
  /** Each seat's cards turned up at least once, which Frite Bot may remember. */
  seen: boolean[][];
  players: number;
  turn: number;
  /** What the die shows while the player picks a card for it. */
  roll: string | null;
  /** The last throw: who rolled what, the card they turned (null when they had already found it), and whether it matched. */
  last: { seat: number; face: string; card: number | null; hit: boolean } | null;
  winners: number[] | null;
}

/** The table as everyone sees it: only found cards and the card just missed show their picture. */
export interface MarketView extends Omit<MarketState, "hands" | "seen"> {
  faces: (string | null)[][];
}

export const MarketMove = z.union([
  z.object({ roll: z.literal(true) }),
  z.object({
    card: z
      .number()
      .int()
      .min(0)
      .max(CARDS - 1),
  }),
]);
export type MarketMove = z.infer<typeof MarketMove>;

export function marketStart(players: number, rng: () => number): MarketState {
  const seats = Array.from({ length: players });
  return {
    hands: seats.map(() => shuffle([...MARKET_FACES], rng)),
    found: seats.map(() => Array(CARDS).fill(false)),
    seen: seats.map(() => Array(CARDS).fill(false)),
    players,
    turn: 0,
    roll: null,
    last: null,
    winners: null,
  };
}

export function marketView(s: MarketState): MarketView {
  const { hands, seen, ...shared } = s;
  const missed = s.last && !s.last.hit ? s.last : null;
  return {
    ...shared,
    faces: hands.map((hand, p) => hand.map((c, i) => (s.found[p]![i] || (missed?.seat === p && missed.card === i) ? c : null))),
  };
}

export const marketScores = (s: Pick<MarketState, "found">) => s.found.map((f) => f.filter(Boolean).length);

const next = (s: MarketState) => (s.turn + 1) % s.players;

/**
 * Rolls the die, or turns one of my cards for it. A food I've already found passes the turn; the right card stays
 * up and I roll again, a wrong one turns back and the turn passes. Finding all six wins.
 */
export function marketPlay(s: MarketState, seat: number, move: MarketMove, rng: () => number): MarketState | null {
  if (s.winners || seat !== s.turn) return null;
  if ("roll" in move) {
    if (s.roll) return null;
    const face = MARKET_FACES[Math.floor(rng() * CARDS)]!;
    const had = s.hands[seat]!.findIndex((c, i) => c === face && s.found[seat]![i]) >= 0;
    if (had) return { ...s, roll: null, turn: next(s), last: { seat, face, card: null, hit: false } };
    return { ...s, roll: face, last: null };
  }
  if (!s.roll || s.found[seat]![move.card]) return null;
  const seen = s.seen.map((v, p) => (p === seat ? v.map((x, i) => x || i === move.card) : v));
  const last = { seat, face: s.roll, card: move.card, hit: s.hands[seat]![move.card] === s.roll };
  if (!last.hit) return { ...s, seen, roll: null, turn: next(s), last };
  const found = s.found.map((v, p) => (p === seat ? v.map((x, i) => x || i === move.card) : v));
  return { ...s, seen, found, roll: null, last, winners: found[seat]!.every(Boolean) ? [seat] : null };
}

/** A move for a bot or someone out of time: roll, then the card it remembers for that food, else one it hasn't turned yet. */
export function marketAuto(s: MarketState, seat: number, rng: () => number): MarketMove | null {
  if (s.winners || seat !== s.turn) return null;
  if (!s.roll) return { roll: true };
  const hand = s.hands[seat]!;
  const free = hand.flatMap((_, i) => (s.found[seat]![i] ? [] : [i]));
  const known = free.find((i) => s.seen[seat]![i] && hand[i] === s.roll && rng() < RECALL);
  const fresh = free.filter((i) => !s.seen[seat]![i]);
  const pool = fresh.length ? fresh : free;
  return { card: known ?? pool[Math.floor(rng() * pool.length)]! };
}
