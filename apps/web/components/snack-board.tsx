"use client";

import { SEAT_COLORS, SNACK_STEPS, type SnackMove, type SnackState } from "@six/shared";
import { useEffect } from "react";
import { playGameSound } from "@/lib/game-sound";
import { useT } from "@/lib/i18n";

const STEPS = Array.from({ length: SNACK_STEPS }, (_, k) => k);

/** Changes on every draw, so the card flips in and the sound plays once per draw. */
const drawKey = (s: SnackState) => (s.last ? `${s.last.seat}:${s.last.card}:${s.steps.flat().join("")}` : null);

/**
 * Snack Race: the treats sit across the middle, the other player's steps come down from the top and mine go up
 * from the bottom, an X per step in the player's colour. The deck and the last card drawn sit below.
 */
export function SnackBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: SnackState;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: SnackMove) => void;
}) {
  const tr = useT();
  const me = mySeat ?? 0;
  const them = 1 - me;
  const mine = mySeat !== null && state.turn === mySeat && !state.winners;
  const drawn = drawKey(state);
  const col = state.last?.card ? state.last.card - 1 : null;

  useEffect(() => {
    if (!drawn) return;
    playGameSound(state.last?.food ? "/sounds/home.wav" : state.last?.card ? "/sounds/step.wav" : "/sounds/capture.wav");
  }, [drawn, state.last]);

  const said = !state.last
    ? ""
    : state.last.food
      ? tr.live.snackGot(nameOf(state.last.seat), state.last.food)
      : state.last.card
        ? tr.live.snackDrew(nameOf(state.last.seat), state.last.card)
        : tr.live.snackStop(nameOf(state.last.seat));

  const numbers = (
    <div className="contents">
      {state.foods.map((_, c) => (
        <span key={c} className={`grid h-8 place-items-center text-lg font-black ${c === col ? "text-brand" : ""}`}>
          {c + 1}
        </span>
      ))}
    </div>
  );
  const cells = (seat: number, ks: number[]) =>
    ks.flatMap((k) =>
      state.foods.map((_, c) => (
        <span
          key={`${seat}:${k}:${c}`}
          className={`grid aspect-square place-items-center rounded-md bg-white text-2xl font-black ring-1 ring-black/10 dark:bg-stone-100 ${c === col ? "ring-2 ring-brand" : ""}`}
          style={{ color: SEAT_COLORS[seat] }}
        >
          {state.steps[seat]![c]! > k && <span className="piece-pop">✕</span>}
        </span>
      )),
    );

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <div className="grid w-full grid-cols-5 gap-1.5 rounded-2xl bg-stone-100 p-2 dark:bg-stone-800">
        {numbers}
        {cells(them, STEPS)}
        {state.foods.map((food, c) => {
          const owner = state.owner[c] ?? null;
          return (
            <span
              key={c}
              className={`grid aspect-square place-items-center rounded-full text-3xl ${owner === null ? "" : "piece-pop opacity-60"}`}
              style={owner === null ? undefined : { boxShadow: `inset 0 0 0 3px ${SEAT_COLORS[owner]}` }}
            >
              {food}
            </span>
          );
        })}
        {cells(me, [...STEPS].reverse())}
        {numbers}
      </div>
      <p className="h-5 text-sm font-semibold">{said}</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!mine}
          onClick={() => play({ draw: true })}
          aria-label={tr.live.snackDraw}
          className="grid h-28 w-20 touch-manipulation place-items-center rounded-xl bg-stone-900 text-3xl shadow-lg ring-4 ring-white transition enabled:hover:-translate-y-1 enabled:active:scale-95 disabled:opacity-60"
        >
          🍟
        </button>
        {state.last && (
          <span
            key={drawn}
            className="card-in grid h-28 w-20 place-items-center rounded-xl text-white shadow-lg ring-4 ring-white"
            style={{ background: SEAT_COLORS[state.last.seat] }}
          >
            <span className={state.last.card ? "text-5xl font-black" : "text-sm font-black tracking-wide"}>{state.last.card ?? "STOP"}</span>
          </span>
        )}
      </div>
      {mine ? (
        <button
          type="button"
          onClick={() => play({ draw: true })}
          className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95"
        >
          {tr.live.snackDraw}
        </button>
      ) : (
        <p className="h-10 text-center text-sm text-stone-500">{state.winners ? "" : tr.live.theirTurn(nameOf(state.turn))}</p>
      )}
    </div>
  );
}
