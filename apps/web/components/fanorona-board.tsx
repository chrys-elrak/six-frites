"use client";

import {
  FANORONA,
  type FanoronaMove,
  type FanoronaOption,
  type FanoronaState,
  fanoronaOptions,
  fanoronaStep,
  fanoronaStrong,
} from "@six/shared";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const GAP = 100;
const PAD = 50;
const POINTS = FANORONA.width * FANORONA.height;
const STONES = ["#fafaf9", "#292524"];
const RIMS = ["#57534e", "#0c0a09"];

const LINKS = Array.from({ length: POINTS }, (_, p) => p).flatMap((p) =>
  [0, 2, ...(fanoronaStrong(p) ? [4, 6] : [])].flatMap((d) => {
    const q = fanoronaStep(p, d);
    return q < 0 ? [] : [[p, q] as const];
  }),
);

export function FanoronaBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: FanoronaState;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: FanoronaMove) => void;
}) {
  const tr = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [choice, setChoice] = useState<FanoronaOption | null>(null);
  useEffect(() => {
    setSelected(null);
    setChoice(null);
  }, [state]);

  const flip = mySeat === 1;
  const xy = (p: number) => {
    const d = flip ? POINTS - 1 - p : p;
    return { x: PAD + (d % FANORONA.width) * GAP, y: PAD + Math.floor(d / FANORONA.width) * GAP };
  };
  const mine = mySeat !== null && state.turn === mySeat && !state.winners;
  const options = mine ? fanoronaOptions(state, mySeat) : [];
  const from = state.chain?.at ?? selected;
  const targets = from === null ? [] : options.filter((o) => o.from === from);
  const movable = new Set(options.map((o) => o.from));
  const takes = !!options[0] && (options[0].approach.length > 0 || options[0].withdraw.length > 0);

  const go = (o: FanoronaOption) => {
    if (o.approach.length && o.withdraw.length) return setChoice(o);
    play({ from: o.from, to: o.to });
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${PAD * 2 + GAP * (FANORONA.width - 1)} ${PAD * 2 + GAP * (FANORONA.height - 1)}`}
        className="w-full max-w-[40rem] touch-manipulation rounded-2xl bg-amber-100 shadow-lg ring-1 ring-black/10"
      >
        {LINKS.map(([p, q]) => (
          <line
            key={`${p}-${q}`}
            x1={xy(p).x}
            y1={xy(p).y}
            x2={xy(q).x}
            y2={xy(q).y}
            stroke="#a16207"
            strokeWidth={4}
          />
        ))}
        {state.last && (
          <line
            x1={xy(state.last.from).x}
            y1={xy(state.last.from).y}
            x2={xy(state.last.to).x}
            y2={xy(state.last.to).y}
            stroke="var(--color-brand)"
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.7}
          />
        )}
        {state.chain?.visited.map((p) => (
          <circle key={`v${p}`} cx={xy(p).x} cy={xy(p).y} r={14} fill="var(--color-brand)" opacity={0.35} />
        ))}
        {state.board.map((stone, p) => {
          if (stone === null) return null;
          const { x, y } = xy(p);
          const can = mine && !state.chain && movable.has(p);
          const ring = choice?.approach.includes(p) ? "#dc2626" : choice?.withdraw.includes(p) ? "#f59e0b" : null;
          return (
            <g
              key={p}
              onClick={can ? () => (setSelected(p), setChoice(null)) : undefined}
              className={can ? "cursor-pointer" : undefined}
            >
              <circle cx={x} cy={y} r={34} fill={STONES[stone]} stroke={RIMS[stone]} strokeWidth={4} />
              {(p === from || ring) && (
                <circle cx={x} cy={y} r={42} fill="none" stroke={ring ?? "var(--color-brand)"} strokeWidth={7} />
              )}
              {can && p !== from && (
                <circle cx={x} cy={y} r={40} fill="none" stroke="var(--color-brand)" strokeWidth={3} opacity={0.6} />
              )}
            </g>
          );
        })}
        {!choice &&
          targets.map((o) => (
            <circle
              key={`t${o.to}`}
              cx={xy(o.to).x}
              cy={xy(o.to).y}
              r={20}
              fill="var(--color-brand)"
              opacity={0.75}
              className="cursor-pointer"
              onClick={() => go(o)}
            />
          ))}
      </svg>
      {!state.winners &&
        (!mine ? (
          <p className="text-sm font-semibold">{tr.live.theirTurn(nameOf(state.turn))}</p>
        ) : choice ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => play({ from: choice.from, to: choice.to, take: "approach" })}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {tr.live.takeFront}
            </button>
            <button
              type="button"
              onClick={() => play({ from: choice.from, to: choice.to, take: "withdraw" })}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
            >
              {tr.live.takeBehind}
            </button>
          </div>
        ) : state.chain ? (
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold">{tr.live.keepTaking}</p>
            <button
              type="button"
              onClick={() => play({ stop: true })}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
            >
              {tr.live.stop}
            </button>
          </div>
        ) : (
          <p className="text-sm font-semibold">{takes ? tr.live.mustTake : tr.live.pickStone}</p>
        ))}
    </div>
  );
}
