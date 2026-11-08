import { z } from "zod";
import { shuffle } from "./eights.js";

const FOODS = ["🍫", "🍬", "🍭", "🍩", "🍪", "🧁", "🍓", "🍌", "🌭", "🥐"];
export const SNACK_COLUMNS = 5;
/** Steps from a player's edge up to the food in the middle. */
export const SNACK_STEPS = 3;

export interface SnackState {
  /** The food waiting in the middle of each column. */
  foods: string[];
  /** How far each seat has come up each column. */
  steps: number[][];
  /** Who took each column's food. */
  owner: (number | null)[];
  players: number;
  turn: number;
  /** The last card drawn: a column number from 1, or null for Stop, and the food it took. */
  last: { seat: number; card: number | null; food: string | null } | null;
  winners: number[] | null;
}

export const SnackMove = z.object({ draw: z.literal(true) });
export type SnackMove = z.infer<typeof SnackMove>;

export function snackStart(players: number, rng: () => number): SnackState {
  return {
    foods: shuffle([...FOODS], rng).slice(0, SNACK_COLUMNS),
    steps: Array.from({ length: players }, () => Array(SNACK_COLUMNS).fill(0)),
    owner: Array(SNACK_COLUMNS).fill(null),
    players,
    turn: 0,
    last: null,
    winners: null,
  };
}

export const snackScores = (s: Pick<SnackState, "owner" | "players">) =>
  Array.from({ length: s.players }, (_, p) => s.owner.filter((o) => o === p).length);

/** Over once all the food is taken, or once nobody can catch the leader with what's left. */
function winnersOf(s: SnackState) {
  const scores = snackScores(s);
  const left = s.owner.filter((o) => o === null).length;
  const [best, second = 0] = [...scores].sort((a, b) => b - a);
  if (left > 0 && best! <= second + left) return null;
  return scores.flatMap((n, p) => (n === best ? [p] : []));
}

/**
 * Draws a card: a number moves me one step up that column, and the step that reaches the middle takes its food.
 * Stop, or a column already eaten, does nothing. Either way the turn passes.
 */
export function snackPlay(s: SnackState, seat: number, _move: SnackMove, rng: () => number): SnackState | null {
  if (s.winners || seat !== s.turn) return null;
  const n = Math.floor(rng() * (SNACK_COLUMNS + 1));
  const card = n === SNACK_COLUMNS ? null : n + 1;
  const next = { ...s, turn: (seat + 1) % s.players, last: { seat, card, food: null } };
  if (card === null || s.owner[card - 1] !== null) return next;
  const col = card - 1;
  const steps = s.steps.map((v, p) => (p === seat ? v.map((x, i) => (i === col ? x + 1 : x)) : v));
  const owner = steps[seat]![col] === SNACK_STEPS ? s.owner.map((o, i) => (i === col ? seat : o)) : s.owner;
  const after = { ...next, steps, owner, last: { seat, card, food: owner === s.owner ? null : s.foods[col]! } };
  return { ...after, winners: winnersOf(after) };
}

export const snackAuto = (s: SnackState, seat: number): SnackMove | null => (s.winners || seat !== s.turn ? null : { draw: true });
