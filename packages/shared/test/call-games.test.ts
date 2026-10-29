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
  battleship,
  boardGame,
  drawStart,
  drawTo,
  gameAnswer,
  gameOver,
  guessTries,
  hangman,
  hangmanWord,
  looseAnswer,
  myTurn,
  penaltyGoals,
  penaltyOutcome,
  randomFleet,
  typedGuesses,
  validFleet,
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

  it("settles two truths and a lie or would you rather on the first choice that fits", () => {
    const rather = { game: "rather", options: ["Fly", "Swim"], choice: 0 } as const;
    expect(gameAnswer({ ...rather, options: [...rather.options] }, "me", [move("them", { choice: 2 }), move("them", { choice: 1 })])?.move).toEqual({ choice: 1 });
    const lie = { game: "lie" as const, statements: ["a", "b", "c"], lie: 2 };
    expect(gameAnswer(lie, "me", [move("me", { choice: 0 }), move("them", { choice: 2 })])?.move).toEqual({ choice: 2 });
  });

  it("matches typed guesses loosely and stops at the right one", () => {
    expect(looseAnswer("The Lion King!")).toBe("lion king");
    expect(looseAnswer("le Roi Lion")).toBe(looseAnswer("Roi lion"));
    const open = (s: string) => (s.startsWith("x") ? null : s);
    const moves = ["Simba", "xjunk", "lion  KING", "Bambi"].map((sealed) => move("them", { sealed }));
    expect(typedGuesses("The Lion King", "me", moves, open)).toEqual([
      { userId: "them", text: "Simba", right: false },
      { userId: "them", text: "lion  KING", right: true },
    ]);
    expect(ChatGame.safeParse({ game: "riddle", emojis: "🦁👑", answer: "the", key: "k".repeat(43) }).success).toBe(false);
  });

  it("only takes a fleet of straight boats that don't overlap, and sinks it", () => {
    expect(validFleet([[0, 1, 2], [10, 15], [23, 24]])).toBe(true);
    expect(validFleet([[3, 4, 5], [10, 15], [23, 24]])).toBe(false);
    expect(validFleet([[0, 1, 2], [2, 7], [23, 24]])).toBe(false);
    expect(validFleet([[0, 6, 12], [10, 15], [23, 24]])).toBe(false);
    for (let i = 0; i < 50; i++) expect(validFleet(randomFleet())).toBe(true);

    const boats = [[0, 1, 2], [10, 15], [23, 24]];
    const shots = [0, 0, 1, 2, 5, 10, 15, 23, 24, 9].map((shot) => move("them", { shot }));
    const sea = battleship(boats, "me", shots);
    expect(sea).toMatchObject({ over: true });
    expect(sea.shots).toHaveLength(8);
    expect(sea.shots.filter((s) => !s.hit)).toHaveLength(1);
  });

  it("takes turns on the board with whoever answers first", () => {
    const moves = [
      move("them", { cell: 0 }),
      move("other", { cell: 1 }),
      move("me", { cell: 0 }),
      move("me", { cell: 2 }),
      move("them", { cell: 1 }),
      move("me", { cell: 6 }),
    ];
    const g = boardGame({ game: "ttt", cell: 4 }, "me", moves);
    expect(g.opponent).toBe("them");
    expect(g.win?.cells.toSorted()).toEqual([2, 4, 6]);
    expect(g.over).toBe(true);
    expect(myTurn(boardGame({ game: "ttt", cell: 4 }, "me", []), "me", "other")).toBe(true);
    expect(myTurn(boardGame({ game: "ttt", cell: 4 }, "me", moves.slice(0, 1)), "me", "other")).toBe(false);
  });

  it("drops discs to the bottom and finds four in a row", () => {
    const cols = [1, 0, 1, 0, 1, 0];
    const moves = cols.map((col, i) => move(i % 2 ? "me" : "them", { col }));
    const g = boardGame({ game: "four", col: 0 }, "me", moves);
    expect(g.board[35]).toBe(0);
    expect(g.board[36]).toBe(1);
    expect(g.win).toMatchObject({ player: 0 });
    expect(gameOver({ game: "four", col: 0 }, "me", moves, () => null)).toBe(true);
  });

  it("keeps drawings small", () => {
    let strokes = drawStart([], 1, 0.5, 0.5);
    strokes = drawTo(strokes, 0.501, 0.5);
    expect(strokes[0]!.points).toEqual([500, 500]);
    strokes = drawTo(strokes, 0.6, 2);
    expect(strokes[0]!.points).toEqual([500, 500, 600, 1000]);
  });
});
