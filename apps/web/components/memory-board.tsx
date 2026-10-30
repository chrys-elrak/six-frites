"use client";

import { type MemoryMove, type MemoryView, SEAT_COLORS } from "@six/shared";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const PEEK_MS = 1500;

export function MemoryBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: MemoryView;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: MemoryMove) => void;
}) {
  const tr = useT();
  const missed = state.open.length === 2 ? state.open.join() : null;
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!missed) {
      setHidden(null);
      return;
    }
    const t = setTimeout(() => setHidden(missed), PEEK_MS);
    return () => clearTimeout(t);
  }, [missed]);
  const mine = mySeat !== null && state.turn === mySeat && !state.winners;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="grid w-full max-w-[26rem] grid-cols-4 gap-2 sm:max-w-[36rem] sm:grid-cols-6">
        {state.faces.map((face, i) => {
          const owner = state.taken[i] ?? null;
          const up = face !== null && (owner !== null || !missed || hidden !== missed);
          const can = mine && owner === null && !(state.open.length === 1 && state.open[0] === i);
          return (
            <button
              key={i}
              type="button"
              disabled={!can}
              onClick={() => play({ card: i })}
              className="group aspect-square touch-manipulation perspective-[40rem]"
            >
              <span
                className={`relative block size-full transition-transform duration-300 transform-3d ${up ? "rotate-y-180" : ""}`}
              >
                <span className="absolute inset-0 grid place-items-center rounded-xl bg-gradient-to-br from-brand to-orange-700 text-2xl shadow ring-2 ring-white backface-hidden group-enabled:group-hover:brightness-110">
                  <span className="opacity-40">🍟</span>
                </span>
                <span
                  className={`absolute inset-0 grid rotate-y-180 place-items-center rounded-xl bg-white text-[clamp(1.75rem,8vw,2.5rem)] shadow backface-hidden dark:bg-stone-100 ${owner === null ? "ring-4 ring-brand" : ""}`}
                  style={owner === null ? undefined : { boxShadow: `inset 0 0 0 4px ${SEAT_COLORS[owner]}` }}
                >
                  {face}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!state.winners && (
        <p className="text-sm font-semibold">{mine ? tr.live.yourTurn : tr.live.theirTurn(nameOf(state.turn))}</p>
      )}
    </div>
  );
}
