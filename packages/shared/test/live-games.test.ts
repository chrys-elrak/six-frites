import { describe, expect, it } from "vitest";
import {
  LUDO_HOME,
  LUDO_HOME_COLUMNS,
  LUDO_TRACK,
  type EightsState,
  type LudoState,
  cardRank,
  eightsAuto,
  eightsPlay,
  eightsStart,
  eightsView,
  ludoAuto,
  ludoPlay,
  ludoStart,
  solveGrid,
  tracePath,
  wordsPlay,
  wordsView,
} from "../src/index.js";

const fixed = (...rolls: number[]) => () => (rolls.shift()! - 1) / 6;

describe("ludo", () => {
  it("lays out 52 track squares and four home columns, none overlapping", () => {
    const cells = [...LUDO_TRACK, ...LUDO_HOME_COLUMNS.flat()].map(([x, y]) => `${x},${y}`);
    expect(LUDO_TRACK).toHaveLength(52);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("needs a 6 to leave the yard, and a 6 earns another roll", () => {
    let s = ludoStart(2);
    s = ludoPlay(s, 0, { roll: true }, fixed(3))!;
    expect(s.turn).toBe(1);
    s = ludoPlay(s, 1, { roll: true }, fixed(6))!;
    expect(s.moving).toBe(true);
    s = ludoPlay(s, 1, { token: 2 }, Math.random)!;
    expect(s.tokens[1]![2]).toBe(0);
    expect(s.turn).toBe(1);
  });

  it("sends a token home when another lands on it, but not on a safe square", () => {
    const base: LudoState = { ...ludoStart(2), turn: 1, moving: true, dice: 4 };
    const red = { ...base, tokens: [[3, -1, -1, -1], [25, -1, -1, -1]] };
    expect(ludoPlay(red, 1, { token: 0 }, Math.random)!.tokens[0]![0]).toBe(-1);
    const safe = { ...base, tokens: [[8, -1, -1, -1], [30, -1, -1, -1]] };
    expect(ludoPlay(safe, 1, { token: 0 }, Math.random)!.tokens[0]![0]).toBe(8);
  });

  it("needs the exact roll to get home", () => {
    const s: LudoState = { ...ludoStart(2), tokens: [[54, LUDO_HOME, LUDO_HOME, LUDO_HOME], [-1, -1, -1, -1]] };
    expect(ludoPlay(s, 0, { roll: true }, fixed(5))!.turn).toBe(1);
    const won = ludoPlay(ludoPlay(s, 0, { roll: true }, fixed(2))!, 0, { token: 0 }, Math.random)!;
    expect(won.winner).toBe(0);
  });

  it("plays whole games between bots to a winner", () => {
    for (const players of [2, 3, 4]) {
      let s = ludoStart(players);
      for (let i = 0; i < 20_000 && s.winner === null; i++) s = ludoPlay(s, s.turn, ludoAuto(s, s.turn)!, Math.random)!;
      expect(s.winner).not.toBeNull();
    }
  });
});

describe("crazy eights", () => {
  it("deals 7 cards to two players and 5 to more", () => {
    expect(eightsStart(2, Math.random).hands.map((h) => h.length)).toEqual([7, 7]);
    expect(eightsStart(4, Math.random).hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
  });

  it("asks for a suit with an 8, and makes the next player draw two with a 2", () => {
    const s: EightsState = { ...eightsStart(3, Math.random), hands: [[7, 1, 30], [40], [41]], pile: [5], suit: 0, turn: 0 };
    expect(eightsPlay(s, 0, { play: 7 }, Math.random)).toBeNull();
    expect(eightsPlay(s, 0, { play: 7, suit: 2 }, Math.random)!.suit).toBe(2);
    const two = eightsPlay(s, 0, { play: 1 }, Math.random)!;
    expect(two.hands[1]).toHaveLength(3);
    expect(two.turn).toBe(2);
  });

  it("hides other hands", () => {
    const view = eightsView(eightsStart(2, Math.random), 0);
    expect(view.hand).toHaveLength(7);
    expect(view.counts).toEqual([7, 7]);
    expect("hands" in view).toBe(false);
  });

  it("plays whole games between bots to a winner", () => {
    for (const players of [2, 3, 4]) {
      for (let round = 0; round < 20; round++) {
        let s = eightsStart(players, Math.random);
        for (let i = 0; i < 5_000 && s.winner === null; i++) s = eightsPlay(s, s.turn, eightsAuto(s, s.turn)!, Math.random)!;
        expect(s.winner).not.toBeNull();
        expect(s.hands.flat().length + s.draw.length + s.pile.length).toBe(52);
        expect(cardRank(s.pile.at(-1)!)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("word hunt", () => {
  const grid = [..."CATSOXEDRNIPLUMB"];

  it("follows touching cells, each used once", () => {
    expect(tracePath(grid, "CAT")).toEqual([0, 1, 2]);
    expect(tracePath(grid, "CATC")).toBeNull();
    expect(tracePath(grid, "CB")).toBeNull();
  });

  it("finds the listed words the grid holds", () => {
    expect(solveGrid(grid, ["CAT", "CATS", "DOG", "TOE"])).toEqual(["CAT", "CATS"]);
  });

  it("counts a word once per player, and keeps it hidden from the others until the end", () => {
    const s = { grid, solution: ["CAT", "CATS"], found: [[], []], over: false };
    const one = wordsPlay(s, 0, { word: "cat" })!;
    expect(wordsPlay(one, 0, { word: "CAT" })).toBeNull();
    expect(wordsPlay(one, 0, { word: "DOG" })).toBeNull();
    expect(wordsView(one, 1).found).toEqual([null, []]);
    expect(wordsView({ ...one, over: true }, 1).found).toEqual([["CAT"], []]);
  });
});
