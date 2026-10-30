"use client";

import { DOTS, type DotsMove, type DotsState, SEAT_COLORS, dotsAcross, dotsDown } from "@six/shared";
import { useT } from "@/lib/i18n";

const CELL = 100;
const PAD = 20;
const SIZE = PAD * 2 + CELL * DOTS.width;

interface Line {
  n: number;
  at: { x1: number; y1: number; x2: number; y2: number };
}

const point = (n: number) => PAD + n * CELL;
const LINES: Line[] = [
  ...Array.from({ length: (DOTS.height + 1) * DOTS.width }, (_, i) => {
    const row = Math.floor(i / DOTS.width);
    const col = i % DOTS.width;
    return { n: dotsAcross(row, col), at: { x1: point(col), y1: point(row), x2: point(col + 1), y2: point(row) } };
  }),
  ...Array.from({ length: DOTS.height * (DOTS.width + 1) }, (_, i) => {
    const row = Math.floor(i / (DOTS.width + 1));
    const col = i % (DOTS.width + 1);
    return { n: dotsDown(row, col), at: { x1: point(col), y1: point(row), x2: point(col), y2: point(row + 1) } };
  }),
];

export function DotsBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: DotsState;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: DotsMove) => void;
}) {
  const tr = useT();
  const mine = mySeat !== null && state.turn === mySeat && !state.winners;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="aspect-square w-full max-w-[30rem] touch-manipulation rounded-2xl bg-white shadow-lg ring-1 ring-black/10 dark:bg-stone-100"
      >
        {state.boxes.map((owner, b) =>
          owner === null ? null : (
            <rect
              key={b}
              x={point(b % DOTS.width)}
              y={point(Math.floor(b / DOTS.width))}
              width={CELL}
              height={CELL}
              fill={SEAT_COLORS[owner]}
              opacity={0.35}
            />
          ),
        )}
        {LINES.map((l) => {
          const by = state.lines[l.n] ?? null;
          return (
            <g key={l.n}>
              <line
                {...l.at}
                stroke={by === null ? "#d6d3d1" : SEAT_COLORS[by]}
                strokeWidth={by === null ? 3 : state.last === l.n ? 14 : 10}
                strokeDasharray={by === null ? "6 8" : undefined}
                strokeLinecap="round"
              />
              {by === null && mine && (
                <line
                  {...l.at}
                  stroke="transparent"
                  strokeWidth={34}
                  className="cursor-pointer hover:stroke-brand/40"
                  onClick={() => play({ line: l.n })}
                />
              )}
            </g>
          );
        })}
        {Array.from({ length: (DOTS.width + 1) * (DOTS.height + 1) }, (_, i) => (
          <circle
            key={i}
            cx={point(i % (DOTS.width + 1))}
            cy={point(Math.floor(i / (DOTS.width + 1)))}
            r={9}
            fill="#292524"
          />
        ))}
      </svg>
      {!state.winners && (
        <p className="text-sm font-semibold">{mine ? tr.live.yourTurn : tr.live.theirTurn(nameOf(state.turn))}</p>
      )}
    </div>
  );
}
