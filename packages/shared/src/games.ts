import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { CALL_GAMES, GUESS_MAX, type GuessHint, RPS_HANDS, guessHint } from "./calls.js";

/** The call games, plus the ones only played in a chat. */
export const CHAT_GAMES = [...CALL_GAMES, "penalty", "hangman"] as const;
export type GameKind = (typeof CHAT_GAMES)[number];

export const GAME_EMOJI: Record<GameKind, string> = { rps: "✊", dice: "🎲", guess: "🔢", penalty: "⚽", hangman: "🍟" };

export const PENALTY_KICKS = 5;
export const PENALTY_SIDES = ["left", "middle", "right"] as const;
export type PenaltySide = (typeof PENALTY_SIDES)[number];
export const PENALTY_ARROWS: Record<PenaltySide, string> = { left: "⬅️", middle: "⬆️", right: "➡️" };

/** Six fries: each wrong letter eats one. */
export const HANGMAN_LIVES = 6;
export const HANGMAN_WORD = { min: 3, max: 16 };
export const HANGMAN_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

const Die = z.number().int().min(1).max(6);
const Seed = z.number().int().min(0).max(5);
const Guess = z.number().int().min(1).max(GUESS_MAX);
const Kicks = z.array(z.enum(PENALTY_SIDES)).length(PENALTY_KICKS);
const Letter = z.string().regex(/^[A-Z]$/);

/**
 * A game sent as a chat message, carrying the sender's move: their hand, their die pick, the number
 * or word to find, or their five shots and five dives. Whoever answers plays against it, so nobody has to be online at the same time.
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
]);
export type ChatGame = z.infer<typeof ChatGame>;

/**
 * An answer to a game message: a hand, a die pick with its share of the roll, one try at the number,
 * five shots and five dives, or one letter of the word.
 */
export const GameMove = z.union([
  z.object({ hand: z.enum(RPS_HANDS) }),
  z.object({ pick: Die, seed: Seed }),
  z.object({ n: Guess }),
  z.object({ shots: Kicks, dives: Kicks }),
  z.object({ letter: Letter }),
]);
export type GameMove = z.infer<typeof GameMove>;

export const GameMoveDTO = z.object({ userId: Id, move: GameMove, at: IsoDate });
export type GameMoveDTO = z.infer<typeof GameMoveDTO>;

/** Most answers one game takes: enough to try every number. */
export const MAX_GAME_MOVES = GUESS_MAX;

/**
 * The answer that settles rock paper scissors, dice or the penalty shootout: the first one from
 * someone other than the sender, in the shape the game expects.
 */
export function gameAnswer(game: ChatGame, senderId: string, moves: GameMoveDTO[]) {
  const fits = (m: GameMove) =>
    game.game === "rps" ? "hand" in m : game.game === "dice" ? "pick" in m : game.game === "penalty" ? "shots" in m : false;
  return moves.find((m) => m.userId !== senderId && fits(m.move)) ?? null;
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

export function gameOver(game: ChatGame, senderId: string, moves: GameMoveDTO[]) {
  if (game.game === "guess") return guessTries(game.secret, senderId, moves).at(-1)?.hint === "right";
  if (game.game === "hangman") {
    const { solved, lost } = hangman(game.word, senderId, moves);
    return solved || lost;
  }
  return !!gameAnswer(game, senderId, moves);
}
