"use client";

import {
  LUDO_HOME,
  LUDO_HOME_COLUMNS,
  LUDO_SAFE,
  LUDO_STARTS,
  LUDO_TRACK,
  type LudoMove,
  type LudoState,
  SEAT_COLORS,
  ludoMovable,
} from "@six/shared";
import { useT } from "@/lib/i18n";

const LUDO_COLORS = SEAT_COLORS;
const CORNERS: [number, number][] = [
  [0, 0],
  [9, 0],
  [9, 9],
  [0, 9],
];
const SPOTS: [number, number][] = [
  [1, 1],
  [4, 1],
  [1, 4],
  [4, 4],
];
const CENTER: [number, number][] = [
  [6, 7],
  [7, 6],
  [8, 7],
  [7, 8],
];

const at = ([x, y]: [number, number], size = 1) => ({
  left: `${(x * 100) / 15}%`,
  top: `${(y * 100) / 15}%`,
  width: `${(size * 100) / 15}%`,
  height: `${(size * 100) / 15}%`,
});

/** The board square a token stands on. */
function cellOf(color: number, token: number, pos: number): [number, number] {
  if (pos < 0) return [CORNERS[color]![0] + SPOTS[token]![0], CORNERS[color]![1] + SPOTS[token]![1]];
  if (pos === LUDO_HOME) return CENTER[color]!;
  if (pos > 50) return LUDO_HOME_COLUMNS[color]![pos - 51]!;
  return LUDO_TRACK[(LUDO_STARTS[color]! + pos) % 52]!;
}

const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function LudoBoard({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: LudoState;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: LudoMove) => void;
}) {
  const tr = useT();
  const mine = mySeat !== null && state.turn === mySeat && state.winner === null;
  const movable = mine && state.moving && state.dice !== null ? ludoMovable(state, mySeat, state.dice) : [];
  const tokens = state.tokens.flatMap((positions, seat) =>
    positions.map((pos, token) => ({ seat, token, cell: cellOf(state.colors[seat]!, token, pos) })),
  );
  const crowd = (cell: [number, number]) => tokens.filter((t) => t.cell[0] === cell[0] && t.cell[1] === cell[1]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative aspect-square w-full max-w-[min(100%,34rem)] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/10 dark:bg-stone-100">
        {CORNERS.map((corner, color) => (
          <div key={color} className="absolute" style={{ ...at(corner, 6), background: LUDO_COLORS[color] }}>
            <div className="absolute inset-[12%] rounded-xl bg-white/90" />
          </div>
        ))}
        {CORNERS.flatMap((corner, color) =>
          SPOTS.map((spot, i) => (
            <div
              key={`${color}-${i}`}
              className="absolute p-[1.2%]"
              style={at([corner[0] + spot[0], corner[1] + spot[1]])}
            >
              <div className="size-full rounded-full opacity-30" style={{ background: LUDO_COLORS[color] }} />
            </div>
          )),
        )}
        {LUDO_TRACK.map((cell, i) => {
          const start = LUDO_STARTS.indexOf(i);
          return (
            <div
              key={i}
              className="absolute grid place-items-center border-[0.5px] border-stone-300 text-[min(2.6vw,0.85rem)] text-stone-400"
              style={{ ...at(cell), background: start >= 0 ? LUDO_COLORS[start] : undefined }}
            >
              {LUDO_SAFE.has(i) && start < 0 && "★"}
            </div>
          );
        })}
        {LUDO_HOME_COLUMNS.flatMap((column, color) =>
          column.map((cell, i) => (
            <div
              key={`h${color}-${i}`}
              className="absolute border-[0.5px] border-stone-300"
              style={{ ...at(cell), background: LUDO_COLORS[color] }}
            />
          )),
        )}
        <div
          className="absolute"
          style={{
            ...at([6, 6], 3),
            background: `conic-gradient(from -45deg, ${LUDO_COLORS[1]} 0 25%, ${LUDO_COLORS[2]} 0 50%, ${LUDO_COLORS[3]} 0 75%, ${LUDO_COLORS[0]} 0)`,
          }}
        />
        {tokens.map(({ seat, token, cell }) => {
          const group = crowd(cell);
          const k = group.findIndex((t) => t.seat === seat && t.token === token);
          const shift = group.length > 1 ? { x: (k % 2) * 40 - 20, y: Math.floor(k / 2) * 40 - 20 } : { x: 0, y: 0 };
          const can = seat === mySeat && movable.includes(token);
          return (
            <button
              key={`${seat}-${token}`}
              type="button"
              disabled={!can}
              onClick={() => play({ token })}
              aria-label={nameOf(seat)}
              className="absolute grid place-items-center transition-[left,top] duration-300 ease-out"
              style={{ ...at(cell), transform: `translate(${shift.x}%, ${shift.y}%) scale(${group.length > 1 ? 0.7 : 1})` }}
            >
              <span
                className={`block size-[78%] rounded-full border-[3px] border-white shadow-md ${can ? "animate-pulse ring-4 ring-stone-900/70" : ""}`}
                style={{ background: LUDO_COLORS[state.colors[seat]!] }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <span key={`${state.rolledBy}-${state.dice}-${state.turn}`} className="reaction-pop text-6xl leading-none">
          {state.dice ? DICE[state.dice - 1] : "🎲"}
        </span>
        <div className="min-w-0 text-sm">
          {state.rolledBy !== null && state.dice !== null && (
            <p className="text-stone-500">{tr.live.rolled(nameOf(state.rolledBy), state.dice)}</p>
          )}
          <p className="font-semibold">
            {state.winner !== null
              ? ""
              : mine
                ? state.moving
                  ? tr.live.pickToken
                  : tr.live.yourTurn
                : tr.live.theirTurn(nameOf(state.turn))}
          </p>
        </div>
        {mine && !state.moving && (
          <button
            type="button"
            onClick={() => play({ roll: true })}
            className="rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-ink shadow active:scale-95"
          >
            {tr.live.roll}
          </button>
        )}
      </div>
    </div>
  );
}
