"use client";

import { type MarketMove, type MarketView, SEAT_COLORS, marketScores } from "@six/shared";
import { useEffect, useState } from "react";
import { playGameSound } from "@/lib/game-sound";
import { useT } from "@/lib/i18n";

const PEEK_MS = 1500;

/** What was just thrown, so the die tumbles and rattles once per throw, also for a throw that passed the turn. */
function throwKey(s: MarketView) {
  if (s.roll) return `${s.turn}:${s.roll}:${marketScores(s)[s.turn]}`;
  return s.last?.card === null ? `${s.last.seat}:${s.last.face}:passed` : null;
}

/**
 * Market Memory: the food die in the middle, and a row of six cards per player. Found cards stay up in the
 * player's colour; a missed one shows for a moment, then turns back.
 */
export function MarketBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: MarketView;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: MarketMove) => void;
}) {
  const tr = useT();
  const thrown = throwKey(state);
  const missed = state.last && !state.last.hit && state.last.card !== null ? `${state.last.seat}:${state.last.card}` : null;
  const [hidden, setHidden] = useState<string | null>(null);
  const mine = mySeat !== null && state.turn === mySeat && !state.winners;
  const die = state.roll ?? state.last?.face ?? null;

  useEffect(() => {
    if (thrown) playGameSound("/sounds/dice.wav");
  }, [thrown]);
  useEffect(() => {
    if (state.last?.hit) playGameSound("/sounds/home.wav");
  }, [state.last]);
  useEffect(() => {
    if (!missed) return;
    const t = setTimeout(() => setHidden(missed), PEEK_MS);
    return () => clearTimeout(t);
  }, [missed]);

  const status = state.winners
    ? null
    : state.last?.card === null && !state.roll
      ? tr.live.marketHad(nameOf(state.last.seat), state.last.face)
      : mine
        ? state.roll
          ? tr.live.marketFind(state.roll)
          : tr.live.yourTurn
        : state.last && !state.last.hit && !state.roll
          ? tr.live.marketMissed(nameOf(state.last.seat))
          : tr.live.theirTurn(nameOf(state.turn));

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <button
        type="button"
        disabled={!mine || !!state.roll}
        onClick={() => play({ roll: true })}
        aria-label={tr.live.roll}
        className="relative grid size-24 touch-manipulation place-items-center rounded-3xl bg-white shadow-lg ring-4 ring-brand transition enabled:hover:scale-105 enabled:active:scale-95 dark:bg-stone-100"
      >
        <span key={thrown ?? "idle"} className={`text-6xl leading-none select-none ${thrown ? "ludo-throw" : ""} ${state.roll ? "" : "opacity-50"}`}>
          {die ?? "🎲"}
        </span>
      </button>
      {mine && !state.roll ? (
        <button
          type="button"
          onClick={() => play({ roll: true })}
          className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95"
        >
          🎲 {tr.live.roll}
        </button>
      ) : (
        <p className="h-10 text-center text-sm font-semibold">{status}</p>
      )}
      <div className="flex w-full flex-col gap-3">
        {state.faces.map((row, p) => (
          <div
            key={p}
            className={`flex flex-col gap-1.5 rounded-2xl p-2 ring-2 transition ${state.turn === p && !state.winners ? "bg-white/70 dark:bg-stone-900/70" : "opacity-70 ring-transparent"}`}
            style={state.turn === p && !state.winners ? { ["--tw-ring-color" as string]: SEAT_COLORS[p] } : undefined}
          >
            <span className="flex items-center gap-1.5 px-1 text-xs font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: SEAT_COLORS[p] }} />
              {p === mySeat ? tr.common.you : nameOf(p)}
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {row.map((face, i) => {
                const found = state.found[p]![i]!;
                const peeking = !found && face !== null && missed === `${p}:${i}` && hidden !== missed;
                const up = found || peeking;
                const can = mine && p === mySeat && !!state.roll && !found;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!can}
                    onClick={() => play({ card: i })}
                    className={`group aspect-[3/4] touch-manipulation perspective-[40rem] ${found ? "piece-pop" : ""}`}
                  >
                    <span className={`relative block size-full transition-transform duration-300 transform-3d ${up ? "rotate-y-180" : ""}`}>
                      <span
                        className="absolute inset-0 grid place-items-center rounded-lg shadow ring-2 ring-white backface-hidden group-enabled:group-hover:-translate-y-0.5 group-enabled:group-hover:brightness-110"
                        style={{ background: `linear-gradient(135deg, ${SEAT_COLORS[p]}, color-mix(in srgb, ${SEAT_COLORS[p]} 60%, black))` }}
                      >
                        <span className="text-lg opacity-40">🍟</span>
                      </span>
                      <span
                        className={`absolute inset-0 grid rotate-y-180 place-items-center rounded-lg bg-white text-[clamp(1.25rem,6vw,2rem)] shadow backface-hidden dark:bg-stone-100 ${found ? "" : "ring-4 ring-red-500"}`}
                        style={found ? { boxShadow: `inset 0 0 0 3px ${SEAT_COLORS[p]}` } : undefined}
                      >
                        {face}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
