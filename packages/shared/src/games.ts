import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { type CallGame, GUESS_MAX, type GuessHint, RPS_HANDS, guessHint } from "./calls.js";

export const GAME_EMOJI: Record<CallGame, string> = { rps: "✊", dice: "🎲", guess: "🔢" };

const Die = z.number().int().min(1).max(6);
const Seed = z.number().int().min(0).max(5);
const Guess = z.number().int().min(1).max(GUESS_MAX);

/**
 * A call game sent as a chat message, carrying the sender's move: their hand, their die pick, or
 * the number to find. Whoever answers plays against it, so nobody has to be online at the same time.
 * ponytail: the move sits in the message the other person's app holds, so a modified client could
 * peek before answering; commit to a hash and reveal after if it ever matters.
 */
export const ChatGame = z.discriminatedUnion("game", [
  z.object({ game: z.literal("rps"), hand: z.enum(RPS_HANDS) }),
  z.object({ game: z.literal("dice"), pick: Die, seed: Seed }),
  z.object({ game: z.literal("guess"), secret: Guess }),
]);
export type ChatGame = z.infer<typeof ChatGame>;

/** An answer to a game message: a hand, a die pick with its share of the roll, or one try at the number. */
export const GameMove = z.union([
  z.object({ hand: z.enum(RPS_HANDS) }),
  z.object({ pick: Die, seed: Seed }),
  z.object({ n: Guess }),
]);
export type GameMove = z.infer<typeof GameMove>;

export const GameMoveDTO = z.object({ userId: Id, move: GameMove, at: IsoDate });
export type GameMoveDTO = z.infer<typeof GameMoveDTO>;

/** Most answers one game takes: enough to try every number. */
export const MAX_GAME_MOVES = GUESS_MAX;

/**
 * The answer that settles rock paper scissors or dice: the first one from someone other than the
 * sender, in the shape the game expects.
 */
export function gameAnswer(game: ChatGame, senderId: string, moves: GameMoveDTO[]) {
  const fits = (m: GameMove) => (game.game === "rps" ? "hand" in m : game.game === "dice" ? "pick" in m : false);
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
