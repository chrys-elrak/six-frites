"use client";

import { REFLEX_GOAL, type ReflexMove, type ReflexState } from "@six/shared";
import { useEffect, useState } from "react";
import { playGameSound } from "@/lib/game-sound";
import { useT } from "@/lib/i18n";

/**
 * Reflex: the item to find pops up in the middle, and my inventory sits below. Between rounds the middle says who
 * found it first; a wrong tap rings red and greys my inventory until the next item.
 */
export function ReflexBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: ReflexState;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: ReflexMove) => void;
}) {
  const tr = useT();
  const [tap, setTap] = useState<{ round: number; item: string } | null>(null);
  const tapped = tap?.round === state.round ? tap.item : null;
  const out = mySeat !== null && state.out.includes(mySeat);
  const hand = mySeat === null ? [] : (state.hands[mySeat] ?? []);
  const scored = state.last?.seat === mySeat && mySeat !== null;

  useEffect(() => {
    if (state.target) playGameSound("/sounds/step.wav");
  }, [state.round, state.target]);
  useEffect(() => {
    if (!state.target && state.last && scored) playGameSound("/sounds/home.wav");
  }, [state.target, state.last, scored]);
  useEffect(() => {
    if (out) playGameSound("/sounds/capture.wav");
  }, [out]);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5">
      <p className="text-sm font-medium text-stone-500">{tr.live.reflexGoal(REFLEX_GOAL)}</p>
      <div className="grid size-40 place-items-center rounded-[2rem] bg-white shadow-xl ring-4 ring-brand dark:bg-stone-100">
        {state.target ? (
          <span key={state.round} className="piece-pop text-8xl leading-none select-none">
            {state.target}
          </span>
        ) : state.last ? (
          <span className="flex flex-col items-center gap-2 px-3 text-center">
            <span className="text-5xl leading-none opacity-60">{state.last.item}</span>
            <span className="text-sm font-bold text-stone-900">
              {state.last.seat === null ? tr.live.reflexNobody : `${nameOf(state.last.seat)} +1`}
            </span>
          </span>
        ) : null}
      </div>
      {mySeat !== null && (
        <>
          <p className={`h-5 text-sm font-semibold ${out ? "text-red-500" : ""}`}>
            {out ? tr.live.reflexOut : state.target ? tr.live.reflexFind : ""}
          </p>
          <div className="grid w-full grid-cols-3 gap-3">
            {hand.map((item) => {
              const ring =
                tapped !== item ? "ring-black/5" : item === state.last?.item && scored ? "ring-green-500" : out ? "ring-red-500" : "ring-brand";
              return (
                <button
                  key={`${state.round}:${item}`}
                  type="button"
                  disabled={!state.target || out}
                  onClick={() => {
                    setTap({ round: state.round, item });
                    play({ round: state.round, item });
                  }}
                  aria-label={item}
                  className={`piece-pop grid aspect-square touch-manipulation place-items-center rounded-2xl bg-white text-5xl shadow ring-4 transition select-none active:scale-90 disabled:opacity-50 dark:bg-stone-100 ${ring}`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
