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
  ludoForced,
  ludoMovable,
} from "@six/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { playSound } from "@/lib/notify";

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

const PIPS: [number, number][][] = [
  [[1, 1]],
  [[0, 0], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 0], [2, 0], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
];
const STEP_MS = 130;
const ROLL_MS = 800;
const SOUND = {
  dice: "/sounds/dice.wav",
  step: "/sounds/step.wav",
  capture: "/sounds/capture.wav",
  home: "/sounds/home.wav",
  win: "/sounds/win.wav",
};

type Move = NonNullable<LudoState["last"]>;

/**
 * Plays out each roll and move as it comes in, with its sound: the die tumbles for a moment, and the
 * moved token walks square by square while any token it takes waits on its target.
 */
function useLudoMotion(state: LudoState, mySeat: number | null) {
  const seen = useRef(state);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [rolling, setRolling] = useState(false);
  const [walk, setWalk] = useState<{ move: Move; pos: number } | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useLayoutEffect(() => {
    if (JSON.stringify(seen.current) === JSON.stringify(state)) return;
    seen.current = state;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
    const move = state.last;
    setRolling(!move && state.dice !== null);
    setWalk(move && { move, pos: move.from });
    if (!move) {
      if (state.dice !== null) playSound(SOUND.dice);
      later(ROLL_MS, () => setRolling(false));
      return;
    }
    const path = move.from < 0 ? [0] : Array.from({ length: move.to - move.from }, (_, i) => move.from + i + 1);
    const end =
      state.winner !== null && state.winner === mySeat
        ? SOUND.win
        : move.captured.length
          ? SOUND.capture
          : move.to === LUDO_HOME
            ? SOUND.home
            : SOUND.step;
    path.forEach((pos, i) =>
      later((i + 1) * STEP_MS, () => {
        const done = i === path.length - 1;
        playSound(done ? end : SOUND.step);
        setWalk(done ? null : { move, pos });
      }),
    );
  }, [state, mySeat]);

  return { rolling, walk };
}

/** The die: thrown in while rolling, its faces flicking by slower and slower, then a ring when it lands. */
function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  const [face, setFace] = useState(1);
  const [landed, setLanded] = useState(0);
  useEffect(() => {
    if (!rolling) return;
    let wait = 40;
    let timer: ReturnType<typeof setTimeout>;
    const flick = () => {
      setFace((f) => ((f + Math.floor(Math.random() * 5)) % 6) + 1);
      timer = setTimeout(flick, (wait *= 1.3));
    };
    flick();
    return () => {
      clearTimeout(timer);
      setLanded((n) => n + 1);
    };
  }, [rolling]);
  const shown = rolling ? face : value;
  return (
    <span className="relative grid size-16 shrink-0 place-items-center">
      <span className={`absolute -bottom-1 h-2 w-11 rounded-full bg-black/30 blur-[2px] ${rolling ? "ludo-shadow" : ""}`} />
      <svg viewBox="0 0 3 3" className={`relative size-14 drop-shadow-md ${rolling ? "ludo-throw" : ""}`}>
        <rect width={3} height={3} rx={0.5} fill="#fff" stroke="#d6d3d1" strokeWidth={0.06} />
        {shown !== null &&
          PIPS[shown - 1]!.map(([x, y], i) => <circle key={i} cx={0.7 + x * 0.8} cy={0.7 + y * 0.8} r={0.28} fill="#1c1917" />)}
      </svg>
      {landed > 0 && !rolling && <span key={landed} className="ludo-ring absolute inset-1 rounded-xl ring-4 ring-brand" />}
    </span>
  );
}

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
  const { rolling, walk } = useLudoMotion(state, mySeat);
  const mine = mySeat !== null && state.turn === mySeat && state.winner === null;
  const canRoll = mine && !rolling && !state.moving;
  const movable = mine && !rolling && state.moving && state.dice !== null ? ludoMovable(state, mySeat, state.dice) : [];
  const tokens = state.tokens.flatMap((positions, seat) =>
    positions.map((pos, token) => {
      const hop = walk && walk.move.seat === seat && walk.move.token === token ? walk.pos : null;
      const cell =
        walk && walk.move.captured.some((c) => c.seat === seat && c.token === token)
          ? cellOf(state.colors[walk.move.seat]!, walk.move.token, walk.move.to)
          : cellOf(state.colors[seat]!, token, hop ?? pos);
      return { seat, token, cell, hop };
    }),
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
        {tokens.map(({ seat, token, cell, hop }) => {
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
              className="absolute grid place-items-center transition-[left,top] duration-150 ease-out"
              style={{ ...at(cell), transform: `translate(${shift.x}%, ${shift.y}%) scale(${group.length > 1 ? 0.7 : 1})` }}
            >
              <span
                key={hop ?? "still"}
                className={`block size-[78%] rounded-full border-[3px] border-white shadow-md ${can ? "animate-pulse ring-4 ring-stone-900/70" : ""} ${hop !== null ? "ludo-hop" : ""}`}
                style={{ background: LUDO_COLORS[state.colors[seat]!] }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!canRoll}
          onClick={() => play({ roll: true })}
          aria-label={tr.live.roll}
          className="rounded-xl transition enabled:cursor-pointer enabled:hover:scale-105 enabled:active:scale-95"
        >
          <Die value={state.dice} rolling={rolling} />
        </button>
        <div className="min-w-0 text-sm">
          {!rolling && state.rolledBy !== null && state.dice !== null && (
            <p className="text-stone-500">{tr.live.rolled(nameOf(state.rolledBy), state.dice)}</p>
          )}
          <p className="font-semibold">
            {state.winner !== null
              ? ""
              : mine
                ? state.moving && !ludoForced(state)
                  ? tr.live.pickToken
                  : tr.live.yourTurn
                : tr.live.theirTurn(nameOf(state.turn))}
          </p>
        </div>
        {canRoll && (
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
