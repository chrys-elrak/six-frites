import { z } from "zod";

/** 5 by 5 boxes between 6 by 6 dots. */
export const DOTS = { width: 5, height: 5 };
const W = DOTS.width;
const H = DOTS.height;
const ACROSS = W * (H + 1);
export const DOTS_LINES = ACROSS + (W + 1) * H;
const BOXES = W * H;

/** Lines are numbered across first, row by row, then down. */
export const dotsAcross = (row: number, col: number) => row * W + col;
export const dotsDown = (row: number, col: number) => ACROSS + row * (W + 1) + col;

/** The four lines around a box: top, bottom, left, right. */
export const dotsSides = (box: number) => {
  const row = Math.floor(box / W);
  const col = box % W;
  return [dotsAcross(row, col), dotsAcross(row + 1, col), dotsDown(row, col), dotsDown(row, col + 1)];
};

const TOUCHING = Array.from({ length: DOTS_LINES }, (_, line) =>
  Array.from({ length: BOXES }, (_, b) => b).filter((b) => dotsSides(b).includes(line)),
);

export interface DotsState {
  /** Who drew each line, or null. */
  lines: (number | null)[];
  /** Who closed each box, or null. */
  boxes: (number | null)[];
  players: number;
  turn: number;
  winners: number[] | null;
  last: number | null;
}

export const DotsMove = z.object({ line: z.number().int().min(0).max(DOTS_LINES - 1) });
export type DotsMove = z.infer<typeof DotsMove>;

export function dotsStart(players: number): DotsState {
  return {
    lines: Array(DOTS_LINES).fill(null),
    boxes: Array(BOXES).fill(null),
    players,
    turn: 0,
    winners: null,
    last: null,
  };
}

/** How many boxes each player has closed. */
export const dotsScores = (s: DotsState) =>
  Array.from({ length: s.players }, (_, p) => s.boxes.filter((b) => b === p).length);

/** Draws a line; closing a box wins it and gives another turn. Once every box is closed, the most boxes win. */
export function dotsPlay(s: DotsState, seat: number, move: DotsMove): DotsState | null {
  if (s.winners || seat !== s.turn || s.lines[move.line] !== null) return null;
  const lines = [...s.lines];
  lines[move.line] = seat;
  const boxes = s.boxes.map((owner, b) =>
    owner ?? (TOUCHING[move.line]!.includes(b) && dotsSides(b).every((l) => lines[l] !== null) ? seat : null),
  );
  const scored = boxes.some((owner, b) => owner !== null && s.boxes[b] === null);
  const next = { ...s, lines, boxes, last: move.line, turn: scored ? seat : (seat + 1) % s.players };
  if (boxes.some((b) => b === null)) return next;
  const scores = dotsScores(next);
  const top = Math.max(...scores);
  return { ...next, winners: scores.flatMap((n, p) => (n === top ? [p] : [])) };
}

/**
 * A move for a bot or someone out of time: close a box when it can, else draw a line that doesn't
 * give one away, else the one that gives away the fewest.
 * ponytail: counts boxes, not chains, so it loses long endgames to careful players.
 */
export function dotsAuto(s: DotsState, seat: number): DotsMove | null {
  if (s.winners || seat !== s.turn) return null;
  const drawn = (b: number) => dotsSides(b).filter((l) => s.lines[l] !== null).length;
  const free = s.lines.flatMap((owner, l) => (owner === null ? [l] : []));
  const closing = free.find((l) => TOUCHING[l]!.some((b) => drawn(b) === 3));
  if (closing !== undefined) return { line: closing };
  const givesAway = (l: number) => TOUCHING[l]!.filter((b) => drawn(b) === 2).length + Math.random() * 0.5;
  return { line: free.map((l) => ({ l, g: givesAway(l) })).reduce((a, b) => (b.g < a.g ? b : a)).l };
}
