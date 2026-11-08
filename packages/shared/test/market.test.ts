import { describe, expect, it } from "vitest";
import { MARKET_FACES, marketAuto, marketPlay, marketStart, marketView } from "../src/market.js";

const rollTo = (face: string) => () => MARKET_FACES.indexOf(face) / MARKET_FACES.length;

describe("market memory", () => {
  it("deals every seat the six foods face down, each in its own order", () => {
    const s = marketStart(3, Math.random);
    for (const hand of s.hands) expect([...hand].sort()).toEqual([...MARKET_FACES].sort());
    expect(marketView(s).faces.flat().every((f) => f === null)).toBe(true);
  });

  it("keeps a found card up and rolls again, and passes the turn on a miss", () => {
    const s = marketStart(2, Math.random);
    const face = s.hands[0]![2]!;
    expect(marketPlay(s, 1, { roll: true }, rollTo(face))).toBeNull();
    expect(marketPlay(s, 0, { card: 2 }, Math.random)).toBeNull();

    const rolled = marketPlay(s, 0, { roll: true }, rollTo(face))!;
    expect(rolled.roll).toBe(face);
    const hit = marketPlay(rolled, 0, { card: 2 }, Math.random)!;
    expect(hit).toMatchObject({ turn: 0, roll: null, last: { seat: 0, card: 2, hit: true } });
    expect(marketView(hit).faces[0]![2]).toBe(face);

    const again = marketPlay(hit, 0, { roll: true }, rollTo(face))!;
    expect(again).toMatchObject({ turn: 1, roll: null, last: { seat: 0, face, card: null } });

    const other = s.hands[1]![0]!;
    const miss = marketPlay(marketPlay(again, 1, { roll: true }, rollTo(other))!, 1, { card: 1 }, Math.random)!;
    expect(miss).toMatchObject({ turn: 0, last: { seat: 1, card: 1, hit: false } });
    expect(marketView(miss).faces[1]![1]).toBe(s.hands[1]![1]);
    expect(marketView(marketPlay(miss, 0, { roll: true }, Math.random)!).faces[1]![1]).toBeNull();
  });

  it("is won by the first to find all six, the bot rolling then turning a card", () => {
    let s = marketStart(2, Math.random);
    expect(marketAuto(s, 0, Math.random)).toEqual({ roll: true });
    for (const [i, face] of s.hands[0]!.entries()) {
      s = marketPlay(marketPlay(s, 0, { roll: true }, rollTo(face))!, 0, { card: i }, Math.random)!;
    }
    expect(s.winners).toEqual([0]);
    expect(marketAuto(s, 0, Math.random)).toBeNull();
  });
});
