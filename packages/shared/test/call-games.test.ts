import { describe, expect, it } from "vitest";
import {
  NEW_GUESS,
  type RpsHand,
  diceOutcome,
  diceRoll,
  duelNext,
  duelPick,
  duelReceive,
  guessChooser,
  guessNext,
  guessOnHint,
  guessOnReady,
  guessOnTry,
  guessRange,
  guessSetSecret,
  guessTry,
  newDuel,
  rpsOutcome,
} from "../src/calls.js";
import {
  ChatGame,
  type GameMove,
  type PenaltyKicks,
  gameAnswer,
  gameOver,
  guessTries,
  hangman,
  hangmanWord,
  penaltyGoals,
  penaltyOutcome,
} from "../src/games.js";

describe("rock paper scissors", () => {
  const fresh = newDuel<RpsHand>();

  it("knows what beats what", () => {
    expect(rpsOutcome("rock", "scissors")).toBe(1);
    expect(rpsOutcome("scissors", "paper")).toBe(1);
    expect(rpsOutcome("paper", "rock")).toBe(1);
    expect(rpsOutcome("rock", "paper")).toBe(-1);
    expect(rpsOutcome("paper", "paper")).toBe(0);
  });

  it("scores a round once both hands are in, whoever plays first", () => {
    const first = duelPick(fresh, "rock", rpsOutcome)!;
    expect(first.wins).toBe(0);
    expect(duelPick(first, "paper", rpsOutcome)).toBeNull();
    const done = duelReceive(first, 1, "scissors", rpsOutcome)!;
    expect(done).toMatchObject({ mine: "rock", theirs: "scissors", wins: 1, losses: 0 });
    expect(duelReceive(done, 1, "paper", rpsOutcome)).toBeNull();

    const theirsFirst = duelPick(duelReceive(fresh, 1, "paper", rpsOutcome)!, "rock", rpsOutcome)!;
    expect(theirsFirst).toMatchObject({ wins: 0, losses: 1 });
  });

  it("follows the other side into the next round and drops stale hands", () => {
    const done = duelReceive(duelPick(fresh, "rock", rpsOutcome)!, 1, "rock", rpsOutcome)!;
    const ahead = duelReceive(done, 2, "paper", rpsOutcome)!;
    expect(ahead).toMatchObject({ round: 2, mine: null, theirs: "paper", wins: 0, losses: 0 });
    expect(duelReceive(duelNext(done), 1, "scissors", rpsOutcome)).toBeNull();
  });
});

describe("dice", () => {
  it("rolls the same on both sides and gives it to whoever picked closer", () => {
    const a = { pick: 2, seed: 4 };
    const b = { pick: 6, seed: 3 };
    expect(diceRoll(a, b)).toBe(2);
    expect(diceRoll(b, a)).toBe(2);
    expect(diceOutcome(a, b)).toBe(1);
    expect(diceOutcome(b, a)).toBe(-1);
    expect(diceOutcome({ pick: 1, seed: 0 }, { pick: 3, seed: 1 })).toBe(0);
  });
});

describe("guess the number", () => {
  it("alternates who picks, starting with the caller", () => {
    expect(guessChooser(1, true)).toBe(true);
    expect(guessChooser(1, false)).toBe(false);
    expect(guessChooser(2, true)).toBe(false);
  });

  it("answers tries until the number is found", () => {
    const chooser = guessSetSecret(NEW_GUESS, 42)!;
    let guesser = guessOnReady(NEW_GUESS, 1)!;

    guesser = guessTry(guesser, 50)!;
    expect(guessTry(guesser, 30)).toBeNull();
    const low = guessOnTry(chooser, 1, 50)!;
    expect(low.hint).toBe("lower");
    guesser = guessOnHint(guesser, 1, 50, low.hint)!;

    guesser = guessTry(guesser, 42)!;
    const right = guessOnTry(low.game, 1, 42)!;
    expect(right.hint).toBe("right");
    guesser = guessOnHint(guesser, 1, 42, right.hint)!;
    expect(guessTry(guesser, 10)).toBeNull();
    expect(guessOnTry(right.game, 1, 10)).toBeNull();
  });

  it("narrows the numbers still possible from the hints", () => {
    expect(guessRange(NEW_GUESS)).toEqual({ lo: 1, hi: 100 });
    const tries = [
      { n: 50, hint: "lower" as const },
      { n: 20, hint: "higher" as const },
      { n: 30, hint: null },
    ];
    expect(guessRange({ ...NEW_GUESS, ready: true, tries })).toEqual({ lo: 21, hi: 49 });
  });

  it("follows the next round when the other side starts it first", () => {
    const solved = { ...NEW_GUESS, ready: true, tries: [{ n: 7, hint: "right" as const }] };
    expect(guessOnReady(solved, 2)).toMatchObject({ round: 2, ready: true, tries: [] });
    expect(guessOnReady(guessNext(solved), 1)).toBeNull();
  });
});

describe("games in a chat", () => {
  const at = new Date().toISOString();
  const move = (userId: string, m: GameMove) => ({ userId, move: m, at });

  it("settles on the first answer that fits, never the sender's", () => {
    const moves = [move("me", { hand: "paper" }), move("them", { n: 4 }), move("them", { hand: "scissors" }), move("them", { hand: "rock" })];
    expect(gameAnswer({ game: "rps", hand: "rock" }, "me", moves)?.move).toEqual({ hand: "scissors" });
    expect(gameAnswer({ game: "dice", pick: 2, seed: 1 }, "me", moves)).toBeNull();
  });

  it("hints each new try at the number and stops at the right one", () => {
    const moves = [50, 50, 20, 42, 7].map((n) => move("them", { n }));
    expect(guessTries(42, "me", moves)).toEqual([
      { userId: "them", n: 50, hint: "lower" },
      { userId: "them", n: 20, hint: "higher" },
      { userId: "them", n: 42, hint: "right" },
    ]);
  });

  it("scores a shot unless the keeper dived the same way, and compares the goals", () => {
    const a: PenaltyKicks = { shots: ["left", "left", "middle", "right", "right"], dives: ["left", "left", "left", "left", "left"] };
    const b: PenaltyKicks = { shots: ["left", "middle", "middle", "left", "left"], dives: ["left", "middle", "right", "right", "left"] };
    expect(penaltyGoals(a.shots, b.dives)).toEqual([false, true, true, false, true]);
    expect(penaltyOutcome(a, b)).toBe(1);
    expect(penaltyOutcome(b, a)).toBe(-1);
    expect(ChatGame.safeParse({ game: "penalty", shots: ["left"], dives: ["left"] }).success).toBe(false);
  });

  it("plays hangman letter by letter until the word is found or the six fries are gone", () => {
    expect(hangmanWord("Pâté 2!")).toBe("PATE");
    const found = hangman("FRITES", "me", [..."FRITQES"].map((letter) => move("them", { letter })));
    expect(found).toMatchObject({ misses: 1, solved: true, lost: false });
    expect(found.tried.map((t) => t.letter).join("")).toBe("FRITQES");

    const lost = hangman("FRITES", "me", [..."ABCDGHJF"].map((letter) => move("them", { letter })));
    expect(lost).toMatchObject({ misses: 6, solved: false, lost: true });
    expect(lost.tried).toHaveLength(6);
    expect(gameOver({ game: "hangman", word: "FRITES" }, "me", [move("me", { letter: "F" })])).toBe(false);
    expect(ChatGame.safeParse({ game: "hangman", word: "été" }).success).toBe(false);
  });
});
