import { z } from "zod";

export const WORDS_SIZE = 4;
export const WORDS_SECONDS = 120;
export const WORDS_MIN = 3;
const CELLS = WORDS_SIZE * WORDS_SIZE;

export interface WordsState {
  grid: string[];
  /** Every dictionary word the grid holds, found when the round starts. */
  solution: string[];
  found: string[][];
  over: boolean;
}

export const WordsMove = z.object({ word: z.string().trim().min(WORDS_MIN).max(CELLS) });
export type WordsMove = z.infer<typeof WordsMove>;

export interface WordsView {
  grid: string[];
  /** My words while playing; everyone's once the round is over. */
  found: (string[] | null)[];
  scores: number[];
  counts: number[];
  over: boolean;
  /** The longest words nobody found, shown at the end. */
  missed: string[];
}

/** Points as in Boggle: 1 for three or four letters, then 2, 3, 5 and 11 for eight or more. */
export const wordPoints = (word: string) => [0, 0, 0, 1, 1, 2, 3, 5][word.length] ?? 11;

export const neighbours = (a: number, b: number) =>
  a !== b && Math.abs((a % WORDS_SIZE) - (b % WORDS_SIZE)) <= 1 && Math.abs(Math.floor(a / WORDS_SIZE) - Math.floor(b / WORDS_SIZE)) <= 1;

/** A path of touching cells, each used once, that spells `word`, or null. */
export function tracePath(grid: string[], word: string): number[] | null {
  const walk = (path: number[]): number[] | null => {
    if (path.length === word.length) return path;
    for (let c = 0; c < CELLS; c++) {
      if (grid[c] !== word[path.length] || path.includes(c) || (path.length && !neighbours(path.at(-1)!, c))) continue;
      const found = walk([...path, c]);
      if (found) return found;
    }
    return null;
  };
  return walk([]);
}

/** Letters drawn by how often they appear in the words, so every language gets a grid it can spell with. */
export function letterWeights(words: string[]) {
  const counts = new Map<string, number>();
  for (const w of words) for (const c of w) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts];
}

/** Every word of the list hidden in the grid, skipping quickly any that use a letter it lacks. */
export function solveGrid(grid: string[], words: string[]) {
  const have = new Set(grid);
  return words.filter((w) => [...w].every((c) => have.has(c)) && tracePath(grid, w) !== null);
}

/**
 * A grid with at least `enough` words in it. `words` are capitals A to Z, three letters or more.
 * ponytail: retries random grids; seed them from a word if a sparse language keeps missing.
 */
export function wordsStart(players: number, words: string[], rng: () => number, enough = 40): WordsState {
  const weights = letterWeights(words);
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const letter = () => {
    let r = rng() * total;
    for (const [c, w] of weights) if ((r -= w) < 0) return c;
    return weights.at(-1)![0];
  };
  let best: { grid: string[]; solution: string[] } = { grid: [], solution: [] };
  for (let i = 0; i < 30 && best.solution.length < enough; i++) {
    const grid = Array.from({ length: CELLS }, letter);
    const solution = solveGrid(grid, words);
    if (solution.length > best.solution.length) best = { grid, solution };
  }
  return { ...best, found: Array.from({ length: players }, () => []), over: false };
}

/** Adds a word to a player's list when the grid holds it and they don't have it yet. */
export function wordsPlay(s: WordsState, seat: number, move: WordsMove): WordsState | null {
  const word = move.word.toUpperCase();
  if (s.over || !s.found[seat] || s.found[seat]!.includes(word) || !s.solution.includes(word)) return null;
  return { ...s, found: s.found.map((f, i) => (i === seat ? [...f, word] : f)) };
}

/** A word for a bot, short ones more often, as people find them. */
export function wordsAuto(s: WordsState, seat: number, rng: () => number): WordsMove | null {
  const left = s.solution.filter((w) => !s.found[seat]!.includes(w));
  if (!left.length) return null;
  const weighted = left.flatMap((w) => Array(Math.max(1, 8 - w.length)).fill(w) as string[]);
  return { word: weighted[Math.floor(rng() * weighted.length)]! };
}

export function wordsView(s: WordsState, seat: number | null): WordsView {
  const all = new Set(s.found.flat());
  return {
    grid: s.grid,
    found: s.found.map((f, i) => (s.over || i === seat ? f : null)),
    scores: s.found.map((f) => f.reduce((n, w) => n + wordPoints(w), 0)),
    counts: s.found.map((f) => f.length),
    over: s.over,
    missed: s.over ? s.solution.filter((w) => !all.has(w)).sort((a, b) => b.length - a.length).slice(0, 10) : [],
  };
}

/** The players with the most points once the round is over. */
export function wordsWinners(s: WordsState) {
  const { scores } = wordsView(s, null);
  const top = Math.max(...scores);
  return scores.flatMap((n, i) => (n === top ? [i] : []));
}
