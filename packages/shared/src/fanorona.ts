import { z } from "zod";

/** A board of 5 rows of 9 points; point p is row floor(p / 9), column p % 9. */
export const FANORONA = { width: 9, height: 5 };
const W = FANORONA.width;
const H = FANORONA.height;
const POINTS = W * H;

/** Turns in a row without a capture before the game stops and the most stones win. */
export const FANORONA_QUIET = 30;

/** Right, left, down, up, then the diagonals; d ^ 1 is the opposite of d. */
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

/** Points where row + column is even also have diagonal lines. */
export const fanoronaStrong = (p: number) => ((p % W) + Math.floor(p / W)) % 2 === 0;

/** The next point from p in direction d along a line of the board, or -1. */
export function fanoronaStep(p: number, d: number) {
  const [dx, dy] = DIRS[d]!;
  const x = (p % W) + dx;
  const y = Math.floor(p / W) + dy;
  if (x < 0 || x >= W || y < 0 || y >= H || (dx && dy && !fanoronaStrong(p))) return -1;
  return y * W + x;
}

export interface FanoronaState {
  board: (0 | 1 | null)[];
  turn: 0 | 1;
  /** The stone still capturing this turn: where it is, where it has been, and the way it last moved. */
  chain: { at: number; visited: number[]; dir: number } | null;
  quiet: number;
  winners: number[] | null;
  last: { from: number; to: number; captured: number[] } | null;
}

export const FanoronaMove = z.union([
  z.object({
    from: z.number().int().min(0).max(POINTS - 1),
    to: z.number().int().min(0).max(POINTS - 1),
    take: z.enum(["approach", "withdraw"]).optional(),
  }),
  z.object({ stop: z.literal(true) }),
]);
export type FanoronaMove = z.infer<typeof FanoronaMove>;

export interface FanoronaOption {
  from: number;
  to: number;
  dir: number;
  approach: number[];
  withdraw: number[];
}

/** Two rows each, and the middle row alternating with the centre point empty. White (seat 0) starts. */
export function fanoronaStart(): FanoronaState {
  const middle: (0 | 1 | null)[] = [1, 0, 1, 0, null, 1, 0, 1, 0];
  return {
    board: [...Array<1>(2 * W).fill(1), ...middle, ...Array<0>(2 * W).fill(0)],
    turn: 0,
    chain: null,
    quiet: 0,
    winners: null,
    last: null,
  };
}

/** The unbroken run of enemy stones starting next to p in direction d. */
function run(board: FanoronaState["board"], p: number, d: number, foe: 0 | 1) {
  const out: number[] = [];
  for (let q = fanoronaStep(p, d); q >= 0 && board[q] === foe; q = fanoronaStep(q, d)) out.push(q);
  return out;
}

/**
 * The moves the player may make now, with what each would take by approach and by withdrawal.
 * Captures must be made when there are any; during a chain only more captures by the same stone count.
 */
export function fanoronaOptions(s: FanoronaState, seat: number): FanoronaOption[] {
  if (s.winners || seat !== s.turn) return [];
  const foe = (1 - seat) as 0 | 1;
  const froms = s.chain ? [s.chain.at] : s.board.flatMap((c, p) => (c === seat ? [p] : []));
  const all: FanoronaOption[] = [];
  for (const from of froms) {
    for (let dir = 0; dir < DIRS.length; dir++) {
      const to = fanoronaStep(from, dir);
      if (to < 0 || s.board[to] !== null) continue;
      if (s.chain && (dir === s.chain.dir || s.chain.visited.includes(to))) continue;
      all.push({ from, to, dir, approach: run(s.board, to, dir, foe), withdraw: run(s.board, from, dir ^ 1, foe) });
    }
  }
  const captures = all.filter((o) => o.approach.length || o.withdraw.length);
  return captures.length || s.chain ? captures : all;
}

const count = (s: FanoronaState, seat: number) => s.board.filter((c) => c === seat).length;

function endTurn(s: FanoronaState, captured: boolean): FanoronaState {
  const turn = (1 - s.turn) as 0 | 1;
  const next = { ...s, turn, chain: null, quiet: captured ? 0 : s.quiet + 1 };
  if (!fanoronaOptions(next, turn).length) return { ...next, winners: [s.turn] };
  if (next.quiet < FANORONA_QUIET) return next;
  const [white, black] = [count(next, 0), count(next, 1)];
  return { ...next, winners: white === black ? [0, 1] : [white > black ? 0 : 1] };
}

/**
 * Moves a stone, taking the enemy stones it approaches or leaves (`take` says which when it could be
 * both), then lets the same stone keep capturing until it can't or the player stops.
 */
export function fanoronaPlay(s: FanoronaState, seat: number, move: FanoronaMove): FanoronaState | null {
  if (s.winners || seat !== s.turn) return null;
  if ("stop" in move) return s.chain ? endTurn(s, true) : null;
  const o = fanoronaOptions(s, seat).find((o) => o.from === move.from && o.to === move.to);
  if (!o) return null;
  const take = move.take ?? (o.approach.length ? "approach" : "withdraw");
  const taken = take === "approach" ? o.approach : o.withdraw;
  if ((o.approach.length && o.withdraw.length && !move.take) || (move.take && !taken.length)) return null;

  const board = [...s.board];
  board[o.from] = null;
  board[o.to] = seat as 0 | 1;
  for (const p of taken) board[p] = null;
  const moved = { ...s, board, last: { from: o.from, to: o.to, captured: taken } };
  if (!taken.length) return endTurn(moved, false);
  if (!board.includes((1 - seat) as 0 | 1)) return { ...moved, chain: null, winners: [seat] };
  const chained = { ...moved, chain: { at: o.to, visited: [...(s.chain?.visited ?? [o.from]), o.to], dir: o.dir } };
  return fanoronaOptions(chained, seat).length ? chained : endTurn(chained, true);
}

const biggest = (o: FanoronaOption) => Math.max(o.approach.length, o.withdraw.length);

/**
 * A sensible move for a bot or someone out of time: the biggest capture, else the quiet move that
 * leaves the other player the smallest one.
 * ponytail: looks one turn ahead; search deeper if players find it too easy.
 */
export function fanoronaAuto(s: FanoronaState, seat: number): FanoronaMove | null {
  const options = fanoronaOptions(s, seat);
  if (!options.length) return s.chain ? { stop: true } : null;
  if (biggest(options[0]!)) {
    const o = options.reduce((a, b) => (biggest(b) > biggest(a) ? b : a));
    return { from: o.from, to: o.to, take: o.approach.length >= o.withdraw.length ? "approach" : "withdraw" };
  }
  const danger = (o: FanoronaOption) => {
    const after = fanoronaPlay(s, seat, { from: o.from, to: o.to })!;
    return Math.max(0, ...fanoronaOptions(after, 1 - seat).map(biggest)) + Math.random() * 0.5;
  };
  const o = options.map((o) => ({ o, d: danger(o) })).reduce((a, b) => (b.d < a.d ? b : a)).o;
  return { from: o.from, to: o.to };
}

/** How many stones each player has left. */
export const fanoronaCounts = (s: FanoronaState) => [count(s, 0), count(s, 1)];
