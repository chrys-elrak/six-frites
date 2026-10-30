import { describe, expect, it } from "vitest";
import {
  DOTS_LINES,
  type FanoronaState,
  dotsAuto,
  dotsPlay,
  dotsSides,
  dotsStart,
  fanoronaAuto,
  fanoronaCounts,
  fanoronaOptions,
  fanoronaPlay,
  fanoronaStart,
  memoryAuto,
  memoryPlay,
  memoryScores,
  memoryStart,
  memoryView,
} from "../src/index.js";

const at = (x: number, y: number) => y * 9 + x;
function board(stones: [number, number, 0 | 1][]): FanoronaState {
  const b: FanoronaState["board"] = Array(45).fill(null);
  for (const [x, y, seat] of stones) b[at(x, y)] = seat;
  return { ...fanoronaStart(), board: b };
}

describe("fanorona", () => {
  it("starts with 22 stones each and the centre empty, and the first move must take", () => {
    const s = fanoronaStart();
    expect(fanoronaCounts(s)).toEqual([22, 22]);
    expect(s.board[at(4, 2)]).toBeNull();
    const options = fanoronaOptions(s, 0);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.approach.length || o.withdraw.length)).toBe(true);
  });

  it("takes the line approached, or the line left behind", () => {
    const s = board([[2, 2, 0], [4, 2, 1], [5, 2, 1], [0, 0, 1]]);
    const after = fanoronaPlay(s, 0, { from: at(2, 2), to: at(3, 2) })!;
    expect(after.last!.captured.sort()).toEqual([at(4, 2), at(5, 2)]);
    const back = board([[2, 2, 0], [1, 2, 1], [0, 2, 1], [8, 4, 1]]);
    expect(fanoronaPlay(back, 0, { from: at(2, 2), to: at(3, 2) })!.last!.captured).toEqual([at(1, 2), at(0, 2)]);
  });

  it("asks which line to take when a move could take either", () => {
    const s = board([[2, 2, 0], [1, 2, 1], [4, 2, 1], [8, 4, 1]]);
    expect(fanoronaPlay(s, 0, { from: at(2, 2), to: at(3, 2) })).toBeNull();
    expect(fanoronaPlay(s, 0, { from: at(2, 2), to: at(3, 2), take: "withdraw" })!.last!.captured).toEqual([at(1, 2)]);
  });

  it("keeps capturing with the same stone, never the same way twice in a row nor back where it was", () => {
    const s = board([[0, 0, 0], [2, 0, 1], [1, 2, 1], [8, 4, 1]]);
    const chained = fanoronaPlay(s, 0, { from: at(0, 0), to: at(1, 0) })!;
    expect(chained.turn).toBe(0);
    expect(chained.chain!.at).toBe(at(1, 0));
    const next = fanoronaOptions(chained, 0);
    expect(next.every((o) => o.from === at(1, 0) && o.dir !== chained.chain!.dir && o.to !== at(0, 0))).toBe(true);
    expect(fanoronaPlay(chained, 0, { stop: true })!.turn).toBe(1);
  });

  it("refuses a quiet move while a capture is possible", () => {
    const s = board([[2, 2, 0], [4, 2, 1], [6, 4, 0], [8, 0, 1]]);
    expect(fanoronaPlay(s, 0, { from: at(6, 4), to: at(7, 4) })).toBeNull();
  });

  it("plays whole games between bots to an end", () => {
    for (let round = 0; round < 10; round++) {
      let s = fanoronaStart();
      for (let i = 0; i < 2_000 && !s.winners; i++) s = fanoronaPlay(s, s.turn, fanoronaAuto(s, s.turn)!)!;
      expect(s.winners).not.toBeNull();
    }
  });
});

describe("dots and boxes", () => {
  it("gives the box and another turn to whoever closes it", () => {
    let s = dotsStart(2);
    const [top, bottom, left, right] = dotsSides(0);
    s = dotsPlay(s, 0, { line: top! })!;
    s = dotsPlay(s, 1, { line: bottom! })!;
    s = dotsPlay(s, 0, { line: left! })!;
    expect(dotsPlay(s, 0, { line: right! })).toBeNull();
    s = dotsPlay(s, 1, { line: right! })!;
    expect(s.boxes[0]).toBe(1);
    expect(s.turn).toBe(1);
    expect(dotsPlay(s, 1, { line: top! })).toBeNull();
  });

  it("plays whole games between bots to an end", () => {
    for (const players of [2, 3, 4]) {
      let s = dotsStart(players);
      for (let i = 0; i < DOTS_LINES && !s.winners; i++) s = dotsPlay(s, s.turn, dotsAuto(s, s.turn)!)!;
      expect(s.winners).not.toBeNull();
      expect(s.lines.every((l) => l !== null)).toBe(true);
    }
  });
});

describe("memory", () => {
  it("keeps a pair and the turn on a match, and passes the turn on a miss", () => {
    let s = memoryStart(2, Math.random);
    expect(memoryView(s).faces.every((f) => f === null)).toBe(true);
    const other = s.cards.findIndex((c) => c !== s.cards[0]);
    s = memoryPlay(s, 0, { card: 0 })!;
    expect(memoryPlay(s, 0, { card: 0 })).toBeNull();
    s = memoryPlay(s, 0, { card: other })!;
    expect(s.turn).toBe(1);
    expect(memoryView(s).faces.filter(Boolean)).toEqual([s.cards[0], s.cards[other]]);
    s = memoryPlay(s, 1, { card: 0 })!;
    expect(s.open).toEqual([0]);
    s = memoryPlay(s, 1, { card: s.cards.lastIndexOf(s.cards[0]!) })!;
    expect(s.turn).toBe(1);
    expect(memoryScores(s)).toEqual([0, 1]);
    expect(memoryView(s).faces.filter(Boolean)).toEqual([s.cards[0], s.cards[0]]);
  });

  it("plays whole games between bots to an end", () => {
    for (const players of [2, 3, 4]) {
      let s = memoryStart(players, Math.random);
      for (let i = 0; i < 1_000 && !s.winners; i++) s = memoryPlay(s, s.turn, memoryAuto(s, s.turn, Math.random)!)!;
      expect(s.winners).not.toBeNull();
      expect(memoryScores(s).reduce((a, b) => a + b)).toBe(12);
    }
  });
});
