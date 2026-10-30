import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { CALL_GAMES, GUESS_MAX, type GuessHint, RPS_HANDS, guessHint } from "./calls.js";
import { EDIT_COLORS } from "./media-edit.js";

/** The call games, plus the ones only played in a chat. */
export const CHAT_GAMES = [
  ...CALL_GAMES,
  "penalty",
  "hangman",
  "lie",
  "rather",
  "riddle",
  "ships",
  "ttt",
  "four",
  "sketch",
] as const;
export type GameKind = (typeof CHAT_GAMES)[number];

export const GAME_EMOJI: Record<GameKind, string> = {
  rps: "✊",
  dice: "🎲",
  guess: "🔢",
  penalty: "⚽",
  hangman: "🍟",
  lie: "🤥",
  rather: "🤔",
  riddle: "🎬",
  ships: "🚢",
  ttt: "⭕",
  four: "🔴",
  sketch: "✏️",
};

export const PENALTY_KICKS = 5;
export const PENALTY_SIDES = ["left", "middle", "right"] as const;
export type PenaltySide = (typeof PENALTY_SIDES)[number];
export const PENALTY_ARROWS: Record<PenaltySide, string> = { left: "⬅️", middle: "⬆️", right: "➡️" };

/** Six fries: each wrong letter eats one. */
export const HANGMAN_LIVES = 6;
export const HANGMAN_WORD = { min: 3, max: 16 };
export const HANGMAN_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/** Longest statement or choice, typed answer, and emoji riddle. */
export const GAME_TEXT = { line: 100, answer: 60, emojis: 30 };

/** A 5 by 5 sea with a boat of 3 and two boats of 2. */
export const SHIPS = { size: 5, boats: [3, 2, 2] };

export const BOARDS = { ttt: { width: 3, height: 3, line: 3 }, four: { width: 7, height: 6, line: 4 } };

/** Drawings are kept as strokes on a square of `scale` units, with points at least `step` apart. */
export const DRAW = { strokes: 100, points: 2000, scale: 1000, step: 8, width: 14 };

const Die = z.number().int().min(1).max(6);
const Seed = z.number().int().min(0).max(5);
const Guess = z.number().int().min(1).max(GUESS_MAX);
const Kicks = z.array(z.enum(PENALTY_SIDES)).length(PENALTY_KICKS);
const Letter = z.string().regex(/^[A-Z]$/);
const Cell = (count: number) => z.number().int().min(0).max(count - 1);
const Line = z.string().trim().min(1).max(GAME_TEXT.line);
const Answer = z
  .string()
  .trim()
  .min(1)
  .max(GAME_TEXT.answer)
  .refine((a) => looseAnswer(a) !== "", "Say what the answer is");
const GameKey = z
  .string()
  .regex(/^[\w-]{43}$/)
  .describe("A key the typed answers are sealed with, so only people who can read the game can read them");
const Fleet = z
  .array(z.array(Cell(SHIPS.size ** 2)))
  .refine(validFleet, "Place one boat of each size in a straight line, none overlapping");
const DrawStroke = z.object({
  color: Cell(EDIT_COLORS.length),
  points: z
    .array(z.number().int().min(0).max(DRAW.scale))
    .min(2)
    .max(DRAW.points * 2)
    .refine((p) => p.length % 2 === 0, "Points come in x, y pairs"),
});
export type DrawStroke = z.infer<typeof DrawStroke>;

/**
 * A game sent as a chat message, carrying the sender's move: their hand, their die pick, the number
 * or word to find, their kicks, statements, choices, riddle, boats or drawing, or the first move on
 * the board. Whoever answers plays against it, so nobody has to be online at the same time.
 * ponytail: the move sits in the message the other person's app holds, so a modified client could
 * peek before answering; commit to a hash and reveal after if it ever matters.
 */
export const ChatGame = z.discriminatedUnion("game", [
  z.object({ game: z.literal("rps"), hand: z.enum(RPS_HANDS) }),
  z.object({ game: z.literal("dice"), pick: Die, seed: Seed }),
  z.object({ game: z.literal("guess"), secret: Guess }),
  z.object({ game: z.literal("penalty"), shots: Kicks, dives: Kicks }),
  z.object({
    game: z.literal("hangman"),
    word: z.string().regex(new RegExp(`^[A-Z]{${HANGMAN_WORD.min},${HANGMAN_WORD.max}}$`)),
  }),
  z.object({ game: z.literal("lie"), statements: z.array(Line).length(3), lie: Cell(3) }),
  z.object({ game: z.literal("rather"), options: z.array(Line).length(2), choice: Cell(2) }),
  z.object({ game: z.literal("riddle"), emojis: z.string().trim().min(1).max(GAME_TEXT.emojis), answer: Answer, key: GameKey }),
  z.object({ game: z.literal("ships"), boats: Fleet }),
  z.object({ game: z.literal("ttt"), cell: Cell(9) }),
  z.object({ game: z.literal("four"), col: Cell(BOARDS.four.width) }),
  z.object({
    game: z.literal("sketch"),
    strokes: z
      .array(DrawStroke)
      .min(1)
      .max(DRAW.strokes)
      .refine((s) => pointCount(s) <= DRAW.points * 2, "This drawing has too many points"),
    answer: Answer,
    key: GameKey,
  }),
]);
export type ChatGame = z.infer<typeof ChatGame>;

/**
 * An answer to a game message: a hand, a die pick with its share of the roll, one try at the number,
 * five shots and five dives, one letter of the word, a statement or choice, a typed guess sealed with
 * the game's key, a shot at the sea, or a move on the board.
 */
export const GameMove = z.union([
  z.object({ hand: z.enum(RPS_HANDS) }),
  z.object({ pick: Die, seed: Seed }),
  z.object({ n: Guess }),
  z.object({ shots: Kicks, dives: Kicks }),
  z.object({ letter: Letter }),
  z.object({ choice: Cell(3) }),
  z.object({ sealed: z.string().regex(/^[\w-]+$/).max(512) }),
  z.object({ shot: Cell(SHIPS.size ** 2) }),
  z.object({ cell: Cell(9) }),
  z.object({ col: Cell(BOARDS.four.width) }),
]);
export type GameMove = z.infer<typeof GameMove>;

export const GameMoveDTO = z.object({ userId: Id, move: GameMove, at: IsoDate });
export type GameMoveDTO = z.infer<typeof GameMoveDTO>;

/** Most answers one game takes: enough to try every number. */
export const MAX_GAME_MOVES = GUESS_MAX;

/** Moves the sender may make on their own game: the board games, where they take turns. */
export const isTurnMove = (m: GameMove) => "cell" in m || "col" in m;

const ANSWERS: Partial<Record<GameKind, (m: GameMove) => boolean>> = {
  rps: (m) => "hand" in m,
  dice: (m) => "pick" in m,
  penalty: (m) => "shots" in m,
  lie: (m) => "choice" in m,
  rather: (m) => "choice" in m && m.choice < 2,
};

/**
 * The answer that settles a game played in one go, like rock paper scissors or two truths and a lie:
 * the first one from someone other than the sender, in the shape the game expects.
 */
export function gameAnswer(game: ChatGame, senderId: string, moves: GameMoveDTO[]) {
  const fits = ANSWERS[game.game];
  return (fits && moves.find((m) => m.userId !== senderId && fits(m.move))) || null;
}

/** The tries at the number in order, each with its hint, up to the right one. */
export function guessTries(secret: number, senderId: string, moves: GameMoveDTO[]) {
  const tries: { userId: string; n: number; hint: GuessHint }[] = [];
  for (const { userId, move } of moves) {
    if (userId === senderId || !("n" in move) || tries.some((t) => t.n === move.n)) continue;
    tries.push({ userId, n: move.n, hint: guessHint(secret, move.n) });
    if (move.n === secret) break;
  }
  return tries;
}

/** Kick by kick, whether the shot went in: it does unless the keeper dived the same way. */
export const penaltyGoals = (shots: PenaltySide[], dives: PenaltySide[]) => shots.map((s, i) => s !== dives[i]);

export type PenaltyKicks = { shots: PenaltySide[]; dives: PenaltySide[] };
const goals = (shots: PenaltySide[], dives: PenaltySide[]) => penaltyGoals(shots, dives).filter(Boolean).length;

/** 1 when `a` scores more against `b`'s dives than `b` does against `a`'s, -1 when fewer, 0 for a draw. */
export const penaltyOutcome = (a: PenaltyKicks, b: PenaltyKicks) => Math.sign(goals(a.shots, b.dives) - goals(b.shots, a.dives));

/** Letters only, in capitals and without accents, so "Pâté" is played as PATE. */
export const hangmanWord = (s: string) =>
  s.normalize("NFD").replace(/[^a-z]/gi, "").toUpperCase().slice(0, HANGMAN_WORD.max);

/** The letters tried in order, each new one counted, until the word is found or the fries run out. */
export function hangman(word: string, senderId: string, moves: GameMoveDTO[]) {
  const tried: { userId: string; letter: string; hit: boolean }[] = [];
  const found = () => [...word].every((c) => tried.some((t) => t.letter === c));
  let misses = 0;
  for (const { userId, move } of moves) {
    if (found() || misses >= HANGMAN_LIVES) break;
    if (userId === senderId || !("letter" in move) || tried.some((t) => t.letter === move.letter)) continue;
    const hit = word.includes(move.letter);
    tried.push({ userId, letter: move.letter, hit });
    if (!hit) misses++;
  }
  return { tried, misses, solved: found(), lost: misses >= HANGMAN_LIVES };
}

const ARTICLES = new Set(["the", "a", "an", "le", "la", "les", "l", "un", "une", "des", "ny", "ilay"]);

/** An answer folded for a loose match: no capitals, accents, punctuation or little words like "the". */
export function looseAnswer(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !ARTICLES.has(w))
    .join(" ");
}

/** The typed guesses in order, opened with `open`, up to the right one. Ones that don't open are skipped. */
export function typedGuesses(answer: string, senderId: string, moves: GameMoveDTO[], open: (sealed: string) => string | null) {
  const target = looseAnswer(answer);
  const guesses: { userId: string; text: string; right: boolean }[] = [];
  for (const { userId, move } of moves) {
    const text = userId !== senderId && "sealed" in move ? open(move.sealed) : null;
    if (text === null) continue;
    const right = looseAnswer(text) === target;
    guesses.push({ userId, text, right });
    if (right) break;
  }
  return guesses;
}

/** Whether these are the boats of the fleet, in order: each in a straight unbroken line, none overlapping. */
export function validFleet(boats: number[][]) {
  const n = SHIPS.size;
  const cells = boats.flat();
  if (boats.length !== SHIPS.boats.length || new Set(cells).size !== cells.length) return false;
  return boats.every((boat, i) => {
    const b = [...boat].sort((x, y) => x - y);
    const step = b.length > 1 && b[1]! - b[0]! === n ? n : 1;
    const straight = b.every((c, k) => c === b[0]! + k * step);
    return b.length === SHIPS.boats[i] && straight && (step === n || Math.floor(b[0]! / n) === Math.floor(b.at(-1)! / n));
  });
}

export function randomFleet() {
  const n = SHIPS.size;
  const taken = new Set<number>();
  return SHIPS.boats.map((length) => {
    for (;;) {
      const down = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (down ? n : n - length + 1));
      const y = Math.floor(Math.random() * (down ? n - length + 1 : n));
      const boat = Array.from({ length }, (_, k) => (y + (down ? k : 0)) * n + x + (down ? 0 : k));
      if (boat.some((c) => taken.has(c))) continue;
      boat.forEach((c) => taken.add(c));
      return boat;
    }
  });
}

/** The shots at the boats in order, each new cell counted, until every boat is sunk. */
export function battleship(boats: number[][], senderId: string, moves: GameMoveDTO[]) {
  const cells = boats.flat();
  const shots: { userId: string; cell: number; hit: boolean }[] = [];
  const shot = (c: number) => shots.some((s) => s.cell === c);
  for (const { userId, move } of moves) {
    if (cells.every(shot)) break;
    if (userId === senderId || !("shot" in move) || shot(move.shot)) continue;
    shots.push({ userId, cell: move.shot, hit: cells.includes(move.shot) });
  }
  return { shots, sunk: boats.filter((b) => b.every(shot)), over: cells.every(shot) };
}

/** The player with `line` in a row across, down or diagonally, and the cells of that row. */
export function lineOf(board: (0 | 1 | null)[], width: number, height: number, line: number) {
  for (let i = 0; i < board.length; i++) {
    const player = board[i];
    if (player == null) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
      const ex = x + dx * (line - 1);
      const ey = y + dy * (line - 1);
      if (ex >= width || ey < 0 || ey >= height) continue;
      const cells = Array.from({ length: line }, (_, k) => (y + dy * k) * width + x + dx * k);
      if (cells.every((c) => board[c] === player)) return { player, cells };
    }
  }
  return null;
}

/**
 * Replays tic-tac-toe or connect four. The sender is player 0 and made the first move in the
 * message; player 1 is whoever answers first, then they take turns. Moves out of turn, onto a taken
 * cell or a full column, or after the end are dropped.
 */
export function boardGame(game: Extract<ChatGame, { game: "ttt" | "four" }>, senderId: string, moves: GameMoveDTO[]) {
  const { width, height, line } = BOARDS[game.game];
  const board: (0 | 1 | null)[] = Array(width * height).fill(null);
  const place = (n: number) => {
    if (game.game === "ttt") return board[n] === null ? n : -1;
    for (let y = height - 1; y >= 0; y--) if (board[y * width + n] === null) return y * width + n;
    return -1;
  };
  const at = (m: GameMove) => (game.game === "ttt" ? ("cell" in m ? m.cell : undefined) : "col" in m ? m.col : undefined);
  board[place(game.game === "ttt" ? game.cell : game.col)] = 0;
  let opponent: string | null = null;
  let turn: 0 | 1 = 1;
  let win: { player: 0 | 1; cells: number[] } | null = null;
  for (const { userId, move } of moves) {
    const n = at(move);
    const mover = turn === 0 ? senderId : opponent;
    if (win || n === undefined || (mover ? userId !== mover : userId === senderId)) continue;
    const i = place(n);
    if (i < 0) continue;
    board[i] = turn;
    opponent ??= userId;
    turn = turn === 0 ? 1 : 0;
    win = lineOf(board, width, height, line);
  }
  return { board, width, opponent, turn, win, over: !!win || board.every((c) => c !== null) };
}

export const myTurn = (g: ReturnType<typeof boardGame>, senderId: string, meId: string) =>
  !g.over && (g.turn === 0 ? meId === senderId : g.opponent ? meId === g.opponent : meId !== senderId);

function pointCount(strokes: DrawStroke[]) {
  return strokes.reduce((n, s) => n + s.points.length, 0);
}

const scaled = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * DRAW.scale);

/** Starts a stroke at x, y (fractions of the pad); the same array back when the drawing is full. */
export function drawStart(strokes: DrawStroke[], color: number, x: number, y: number) {
  if (strokes.length >= DRAW.strokes || pointCount(strokes) + 2 > DRAW.points * 2) return strokes;
  return [...strokes, { color, points: [scaled(x), scaled(y)] }];
}

/** Carries the last stroke on to x, y once it has moved far enough, while the drawing has room. */
export function drawTo(strokes: DrawStroke[], x: number, y: number) {
  const last = strokes.at(-1);
  if (!last || pointCount(strokes) + 2 > DRAW.points * 2) return strokes;
  const [px, py] = last.points.slice(-2) as [number, number];
  const p = [scaled(x), scaled(y)] as const;
  if (Math.hypot(p[0] - px, p[1] - py) < DRAW.step) return strokes;
  return [...strokes.slice(0, -1), { ...last, points: [...last.points, ...p] }];
}

export function strokePath(points: number[]) {
  let d = `M${points[0]} ${points[1]}`;
  for (let i = 0; i < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
  return d;
}

/** Whether the game has ended. `open` reads typed guesses, sealed with the game's key. */
export function gameOver(game: ChatGame, senderId: string, moves: GameMoveDTO[], open: (sealed: string) => string | null) {
  switch (game.game) {
    case "guess":
      return guessTries(game.secret, senderId, moves).at(-1)?.hint === "right";
    case "hangman": {
      const { solved, lost } = hangman(game.word, senderId, moves);
      return solved || lost;
    }
    case "riddle":
    case "sketch":
      return typedGuesses(game.answer, senderId, moves, open).at(-1)?.right === true;
    case "ships":
      return battleship(game.boats, senderId, moves).over;
    case "ttt":
    case "four":
      return boardGame(game, senderId, moves).over;
    default:
      return !!gameAnswer(game, senderId, moves);
  }
}
