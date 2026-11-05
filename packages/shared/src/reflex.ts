import { z } from "zod";
import { shuffle } from "./eights.js";

/** What pops up to be found, and what fills the inventories. */
export const REFLEX_ITEMS = ["🍎", "🍌", "🍇", "🍓", "🍉", "🍍", "🥝", "🥕", "🌽", "🥦", "🍩", "🍪", "🧁", "🍫", "🍿", "🥨", "🧀", "🍦"];
/** How many items each inventory holds. */
export const REFLEX_HAND = 6;
/** Points to win. */
export const REFLEX_GOAL = 10;
/** How long a round waits for someone to find the item, and the pause before the next one. */
export const REFLEX_ROUND_MS = 6000;
export const REFLEX_PAUSE_MS = 1400;
/** How often Frite Bot taps the wrong item. */
const BOT_MISS = 0.12;

export interface ReflexState {
  players: number;
  round: number;
  /** The item everyone races to find in their inventory; null between rounds. */
  target: string | null;
  /** Each seat's inventory, dealt fresh every round: they all hold the target, in a different place. */
  hands: string[][];
  scores: number[];
  /** Seats that tapped a wrong item this round, so are out of it. */
  out: number[];
  /** How the last round went: who found `item` first, or null when nobody did. */
  last: { seat: number | null; item: string } | null;
  winners: number[] | null;
}

export const ReflexMove = z.object({ round: z.number().int().min(1), item: z.string().min(1).max(16) });
export type ReflexMove = z.infer<typeof ReflexMove>;

/** A new round: an item to find, and fresh inventories that all hold it among others, shuffled. */
export function reflexDeal(s: ReflexState, rng: () => number): ReflexState {
  const target = REFLEX_ITEMS[Math.floor(rng() * REFLEX_ITEMS.length)]!;
  const others = REFLEX_ITEMS.filter((i) => i !== target);
  const hands = Array.from({ length: s.players }, () => shuffle([target, ...shuffle(others, rng).slice(0, REFLEX_HAND - 1)], rng));
  return { ...s, round: s.round + 1, target, hands, out: [] };
}

export function reflexStart(players: number, rng: () => number): ReflexState {
  const empty = { players, round: 0, target: null, hands: [], scores: Array(players).fill(0), out: [], last: null, winners: null };
  return reflexDeal(empty, rng);
}

/** Nobody found it in time: the round ends without a point. */
export const reflexTimeout = (s: ReflexState): ReflexState =>
  s.target ? { ...s, target: null, last: { seat: null, item: s.target } } : s;

/**
 * Taps an item of my inventory in the current round. The target scores and ends the round; anything else puts me
 * out of it, and the round ends without a point once everyone is out.
 */
export function reflexPlay(s: ReflexState, seat: number, move: ReflexMove): ReflexState | null {
  if (s.winners || !s.target || move.round !== s.round || s.out.includes(seat) || !s.hands[seat]?.includes(move.item)) return null;
  if (move.item !== s.target) {
    const out = [...s.out, seat];
    return out.length === s.players ? { ...s, out, target: null, last: { seat: null, item: s.target } } : { ...s, out };
  }
  const scores = s.scores.map((n, i) => (i === seat ? n + 1 : n));
  return { ...s, scores, out: [], target: null, last: { seat, item: s.target }, winners: scores[seat]! >= REFLEX_GOAL ? [seat] : null };
}

/** What Frite Bot taps: nearly always the right item, now and then a wrong one. */
export function reflexAuto(s: ReflexState, seat: number, rng: () => number): ReflexMove | null {
  if (s.winners || !s.target || s.out.includes(seat)) return null;
  const wrong = s.hands[seat]!.filter((i) => i !== s.target);
  return { round: s.round, item: rng() < BOT_MISS ? wrong[Math.floor(rng() * wrong.length)]! : s.target };
}

/** How long Frite Bot takes to find the item, in ms: about as quick as a person, never instant. */
export const reflexBotDelay = (rng: () => number) => 1000 + rng() * 1400;
