import { describe, expect, it } from "vitest";
import { SNACK_COLUMNS, SNACK_STEPS, snackAuto, snackPlay, snackScores, snackStart } from "../src/snack.js";

const draw = (n: number | null) => () => (n === null ? SNACK_COLUMNS : n - 1) / (SNACK_COLUMNS + 1);

describe("snack race", () => {
  it("steps up the drawn column, does nothing on Stop, and always passes the turn", () => {
    const s = snackStart(2, Math.random);
    expect(snackPlay(s, 1, { draw: true }, draw(1))).toBeNull();
    const a = snackPlay(s, 0, { draw: true }, draw(3))!;
    expect(a).toMatchObject({ turn: 1, last: { seat: 0, card: 3 } });
    expect(a.steps[0]).toEqual([0, 0, 1, 0, 0]);
    const b = snackPlay(a, 1, { draw: true }, draw(null))!;
    expect(b).toMatchObject({ turn: 0, last: { seat: 1, card: null }, steps: a.steps });
  });

  it("gives the food to whoever reaches the middle first, then that column does nothing", () => {
    let s = snackStart(2, Math.random);
    for (let i = 0; i < SNACK_STEPS; i++) s = snackPlay(snackPlay(s, 0, { draw: true }, draw(2))!, 1, { draw: true }, draw(null))!;
    expect(s.owner[1]).toBe(0);
    expect(snackPlay(s, 0, { draw: true }, draw(2))!.last!.food).toBeNull();
    const again = snackPlay(s, 0, { draw: true }, draw(2))!;
    expect(again.steps[0]![1]).toBe(SNACK_STEPS);
    expect(snackScores(again)).toEqual([1, 0]);
  });

  it("ends once nobody can catch up, the bot just drawing", () => {
    let s = snackStart(2, Math.random);
    expect(snackAuto(s, 0)).toEqual({ draw: true });
    for (const col of [1, 2, 3])
      for (let i = 0; i < SNACK_STEPS; i++) {
        s = snackPlay(s, 0, { draw: true }, draw(col))!;
        if (!s.winners) s = snackPlay(s, 1, { draw: true }, draw(null))!;
      }
    expect(s.owner).toEqual([0, 0, 0, null, null]);
    expect(s.winners).toEqual([0]);
    expect(snackAuto(s, 1)).toBeNull();
  });
});
