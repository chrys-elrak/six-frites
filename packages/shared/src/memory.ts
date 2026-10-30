import { z } from "zod";
import { shuffle } from "./eights.js";

/** The pictures on the cards, each on two of them. */
export const MEMORY_FACES = ["🍔", "🍕", "🌭", "🍩", "🍪", "🍦", "🍉", "🍓", "🍍", "🥑", "🌮", "🍒"];
const CARDS = MEMORY_FACES.length * 2;
/** How likely Frite Bot is to remember a card it has seen. */
const RECALL = 0.7;

export interface MemoryState {
  /** The picture under each card. */
  cards: string[];
  /** Who found each card's pair, or null. */
  taken: (number | null)[];
  /** The cards turned up this turn. Two that don't match stay up until the next card is turned. */
  open: number[];
  /** Cards turned up at least once, which Frite Bot may remember. */
  seen: boolean[];
  players: number;
  turn: number;
  winners: number[] | null;
}

/** The table as everyone sees it: only the cards turned up or already paired show their picture. */
export interface MemoryView extends Omit<MemoryState, "cards" | "seen"> {
  faces: (string | null)[];
}

export const MemoryMove = z.object({
  card: z
    .number()
    .int()
    .min(0)
    .max(CARDS - 1),
});
export type MemoryMove = z.infer<typeof MemoryMove>;

export function memoryStart(players: number, rng: () => number): MemoryState {
  return {
    cards: shuffle([...MEMORY_FACES, ...MEMORY_FACES], rng),
    taken: Array(CARDS).fill(null),
    open: [],
    seen: Array(CARDS).fill(false),
    players,
    turn: 0,
    winners: null,
  };
}

export function memoryView(s: MemoryState): MemoryView {
  const { cards, seen, ...shared } = s;
  return { ...shared, faces: cards.map((c, i) => (s.taken[i] !== null || s.open.includes(i) ? c : null)) };
}

/** How many pairs each player has found. */
export const memoryScores = (s: Pick<MemoryState, "taken" | "players">) =>
  Array.from({ length: s.players }, (_, p) => s.taken.filter((t) => t === p).length / 2);

/** Turns a card up; a second one that matches the first is a pair won and another turn, else the turn passes. */
export function memoryPlay(s: MemoryState, seat: number, move: MemoryMove): MemoryState | null {
  const open = s.open.length === 2 ? [] : s.open;
  if (s.winners || seat !== s.turn || s.taken[move.card] !== null || open.includes(move.card)) return null;
  const seen = s.seen.map((v, i) => v || i === move.card);
  const [first] = open;
  if (first === undefined) return { ...s, seen, open: [move.card] };
  if (s.cards[first] !== s.cards[move.card]) {
    return { ...s, seen, open: [first, move.card], turn: (seat + 1) % s.players };
  }
  const taken = s.taken.map((t, i) => (i === first || i === move.card ? seat : t));
  const next = { ...s, seen, taken, open: [] };
  if (taken.some((t) => t === null)) return next;
  const scores = memoryScores(next);
  const top = Math.max(...scores);
  return { ...next, winners: scores.flatMap((n, p) => (n === top ? [p] : [])) };
}

/** A move for a bot or someone out of time: a pair it remembers, else a card nobody has turned yet. */
export function memoryAuto(s: MemoryState, seat: number, rng: () => number): MemoryMove | null {
  if (s.winners || seat !== s.turn) return null;
  const open = s.open.length === 2 ? [] : s.open;
  const free = s.taken.flatMap((t, i) => (t === null && !open.includes(i) ? [i] : []));
  const known = free.filter((i) => s.seen[i] && rng() < RECALL);
  const fresh = free.filter((i) => !s.seen[i]);
  const pool = fresh.length ? fresh : free;
  const guess = pool[Math.floor(rng() * pool.length)]!;
  const [first] = open;
  const match =
    first === undefined
      ? known.find((i) => known.some((j) => j !== i && s.cards[j] === s.cards[i]))
      : known.find((i) => s.cards[i] === s.cards[first]);
  return { card: match ?? guess };
}
