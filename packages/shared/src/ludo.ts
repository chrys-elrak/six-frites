import { z } from "zod";

/** A token's progress along its own path: -1 in the yard, 0 to 50 on the track, 51 to 55 up its home column, 56 home. */
export const LUDO_HOME = 56;
const TRACK_END = 50;
const TRACK = 52;
export const LUDO_TOKENS = 4;

/** Where each colour (red, green, yellow, blue) joins the track, and the star squares 8 further on; tokens there can't be taken. */
export const LUDO_STARTS = [0, 13, 26, 39];
export const LUDO_SAFE = new Set([...LUDO_STARTS, ...LUDO_STARTS.map((s) => s + 8)]);

/** The track's 52 squares on a 15 by 15 board, clockwise from red's start. */
export const LUDO_TRACK: [number, number][] = [
  ...[1, 2, 3, 4, 5].map((x) => [x, 6]),
  ...[5, 4, 3, 2, 1, 0].map((y) => [6, y]),
  [7, 0],
  ...[0, 1, 2, 3, 4, 5].map((y) => [8, y]),
  ...[9, 10, 11, 12, 13, 14].map((x) => [x, 6]),
  [14, 7],
  ...[14, 13, 12, 11, 10, 9].map((x) => [x, 8]),
  ...[9, 10, 11, 12, 13, 14].map((y) => [8, y]),
  [7, 14],
  ...[14, 13, 12, 11, 10, 9].map((y) => [6, y]),
  ...[5, 4, 3, 2, 1, 0].map((x) => [x, 8]),
  [0, 7],
  [0, 6],
] as [number, number][];

/** Each colour's home column, from the edge of the board in towards the middle. */
export const LUDO_HOME_COLUMNS: [number, number][][] = [
  [1, 2, 3, 4, 5].map((x) => [x, 7]),
  [1, 2, 3, 4, 5].map((y) => [7, y]),
  [13, 12, 11, 10, 9].map((x) => [x, 7]),
  [13, 12, 11, 10, 9].map((y) => [7, y]),
] as [number, number][][];

/** The colours in play: opposite corners for two players. */
export const ludoColors = (players: number) => (players === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, players));

export interface LudoState {
  colors: number[];
  tokens: number[][];
  turn: number;
  /** The last roll; `moving` while the player still has to pick a token for it. */
  dice: number | null;
  rolledBy: number | null;
  moving: boolean;
  sixes: number;
  winner: number | null;
  last: { seat: number; token: number; from: number; to: number; captured: { seat: number; token: number }[] } | null;
}

export const LudoMove = z.union([z.object({ roll: z.literal(true) }), z.object({ token: z.number().int().min(0).max(LUDO_TOKENS - 1) })]);
export type LudoMove = z.infer<typeof LudoMove>;

export function ludoStart(players: number): LudoState {
  return {
    colors: ludoColors(players),
    tokens: Array.from({ length: players }, () => Array(LUDO_TOKENS).fill(-1)),
    turn: 0,
    dice: null,
    rolledBy: null,
    moving: false,
    sixes: 0,
    winner: null,
    last: null,
  };
}

/** The track square a token stands on, or null in the yard or its home column. */
export const ludoSquare = (color: number, pos: number) => (pos >= 0 && pos <= TRACK_END ? (LUDO_STARTS[color]! + pos) % TRACK : null);

/** The tokens that can move with this roll. */
export function ludoMovable(s: LudoState, seat: number, dice: number) {
  return s.tokens[seat]!.flatMap((pos, i) => ((pos < 0 ? dice === 6 : pos + dice <= LUDO_HOME) ? [i] : []));
}

const next = (s: LudoState) => (s.turn + 1) % s.tokens.length;

function pass(s: LudoState): LudoState {
  return { ...s, turn: next(s), moving: false, sixes: 0 };
}

/**
 * Rolls for the player whose turn it is, or moves the token they picked. A 6, a capture or a token
 * reaching home earns another roll, but a third 6 in a row ends the turn.
 */
export function ludoPlay(s: LudoState, seat: number, move: LudoMove, rng: () => number): LudoState | null {
  if (s.winner !== null || seat !== s.turn) return null;
  if ("roll" in move) {
    if (s.moving) return null;
    const dice = 1 + Math.floor(rng() * 6);
    const sixes = dice === 6 ? s.sixes + 1 : 0;
    const rolled = { ...s, dice, rolledBy: seat, last: null };
    if (sixes === 3) return pass(rolled);
    if (!ludoMovable(s, seat, dice).length) return dice === 6 ? { ...rolled, sixes } : pass(rolled);
    return { ...rolled, sixes, moving: true };
  }
  if (!s.moving || s.dice === null || !ludoMovable(s, seat, s.dice).includes(move.token)) return null;
  const color = s.colors[seat]!;
  const from = s.tokens[seat]![move.token]!;
  const to = from < 0 ? 0 : from + s.dice;
  const tokens = s.tokens.map((t) => [...t]);
  tokens[seat]![move.token] = to;
  const square = ludoSquare(color, to);
  const captured: { seat: number; token: number }[] = [];
  if (square !== null && !LUDO_SAFE.has(square)) {
    tokens.forEach((theirs, other) => {
      if (other === seat) return;
      theirs.forEach((pos, token) => {
        if (ludoSquare(s.colors[other]!, pos) !== square) return;
        theirs[token] = -1;
        captured.push({ seat: other, token });
      });
    });
  }
  const won = tokens[seat]!.every((p) => p === LUDO_HOME);
  const again = !won && (s.dice === 6 || captured.length > 0 || to === LUDO_HOME);
  const moved = { ...s, tokens, last: { seat, token: move.token, from, to, captured }, winner: won ? seat : null };
  return again ? { ...moved, moving: false } : pass(moved);
}

/** A sensible move for a bot, or for someone whose time ran out: finish, capture, leave the yard, reach safety, then run. */
export function ludoAuto(s: LudoState, seat: number): LudoMove | null {
  if (s.winner !== null || seat !== s.turn) return null;
  if (!s.moving || s.dice === null) return { roll: true };
  const color = s.colors[seat]!;
  const dice = s.dice;
  const score = (token: number) => {
    const from = s.tokens[seat]![token]!;
    const to = from < 0 ? 0 : from + dice;
    const square = ludoSquare(color, to);
    const takes =
      square !== null &&
      !LUDO_SAFE.has(square) &&
      s.tokens.some((theirs, other) => other !== seat && theirs.some((p) => ludoSquare(s.colors[other]!, p) === square));
    return (
      (to === LUDO_HOME ? 100 : 0) +
      (takes ? 80 : 0) +
      (from < 0 ? 50 : 0) +
      (square !== null && LUDO_SAFE.has(square) ? 20 : 0) +
      (from <= TRACK_END && to > TRACK_END ? 15 : 0) +
      to / 10
    );
  };
  const options = ludoMovable(s, seat, dice);
  return { token: options.reduce((best, t) => (score(t) > score(best) ? t : best), options[0]!) };
}
