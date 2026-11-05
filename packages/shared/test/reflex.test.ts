import { describe, expect, it } from "vitest";
import { REFLEX_GOAL, REFLEX_HAND, reflexAuto, reflexDeal, reflexPlay, reflexStart, reflexTimeout } from "../src/reflex.js";

const rng = () => 0.42;

describe("reflex", () => {
  it("deals every seat an inventory holding the item to find", () => {
    const s = reflexStart(3, Math.random);
    expect(s.round).toBe(1);
    for (const hand of s.hands) {
      expect(hand).toHaveLength(REFLEX_HAND);
      expect(new Set(hand).size).toBe(REFLEX_HAND);
      expect(hand).toContain(s.target);
    }
  });

  it("gives the point to the first right tap, and puts a wrong tap out of the round", () => {
    const s = reflexStart(2, rng);
    const wrong = s.hands[0]!.find((i) => i !== s.target)!;
    const out = reflexPlay(s, 0, { round: 1, item: wrong })!;
    expect(out.out).toEqual([0]);
    expect(reflexPlay(out, 0, { round: 1, item: s.target! })).toBeNull();

    const won = reflexPlay(out, 1, { round: 1, item: s.target! })!;
    expect(won).toMatchObject({ scores: [0, 1], target: null, last: { seat: 1, item: s.target } });
    expect(reflexPlay(won, 0, { round: 1, item: s.target! })).toBeNull();
    expect(reflexDeal(won, rng).round).toBe(2);
  });

  it("ends a round without a point when everyone is out or time runs out", () => {
    const s = reflexStart(2, rng);
    const miss = (seat: number) => ({ round: 1, item: s.hands[seat]!.find((i) => i !== s.target)! });
    const done = reflexPlay(reflexPlay(s, 0, miss(0))!, 1, miss(1))!;
    expect(done).toMatchObject({ target: null, scores: [0, 0], last: { seat: null } });
    expect(reflexTimeout(s)).toMatchObject({ target: null, last: { seat: null, item: s.target } });
  });

  it("is won at the goal, and the bot plays the current round", () => {
    let s = reflexStart(2, rng);
    for (let i = 0; i < REFLEX_GOAL; i++) s = reflexDeal(reflexPlay(s, 1, { round: s.round, item: s.target! })!, rng);
    expect(s.scores[1]).toBe(REFLEX_GOAL);
    expect(s.winners).toEqual([1]);
    const fresh = reflexStart(2, () => 0.9);
    expect(reflexAuto(fresh, 0, () => 0.9)).toEqual({ round: 1, item: fresh.target });
  });
});
