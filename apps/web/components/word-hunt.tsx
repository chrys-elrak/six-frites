"use client";

import { WORDS_MIN, WORDS_SIZE, type WordsMove, type WordsView, neighbours, wordPoints } from "@six/shared";
import { Check, X } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useCountdown } from "@/lib/live";

/** Extends a path with the tile tapped or slid onto: back one step on the one before, else only onto a free neighbour. */
function extend(path: number[], tile: number) {
  if (path.at(-2) === tile) return path.slice(0, -1);
  if (path.includes(tile)) return path;
  return !path.length || neighbours(path.at(-1)!, tile) ? [...path, tile] : path;
}

export function WordHunt({
  state,
  deadline,
  mySeat,
  nameOf,
  play,
}: {
  state: WordsView;
  deadline: string | null;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: WordsMove) => Promise<boolean>;
}) {
  const tr = useT();
  const [path, setPath] = useState<number[]>([]);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const drag = useRef<{ moved: boolean } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const seconds = useCountdown(deadline);
  const word = path.map((i) => state.grid[i]).join("");
  const mine = mySeat !== null ? (state.found[mySeat] ?? []) : [];

  async function submit(letters = word) {
    setPath([]);
    if (letters.length < WORDS_MIN) return;
    const ok = await play({ word: letters });
    const text = ok ? `+${wordPoints(letters)} · ${letters}` : mine.includes(letters) ? tr.live.alreadyFound : tr.live.notAWord;
    setNote({ text, good: ok });
    setTimeout(() => setNote((n) => (n?.text === text ? null : n)), 1500);
  }

  const tileAt = (x: number, y: number) => {
    const box = grid.current!.getBoundingClientRect();
    const fx = ((x - box.left) / box.width) * WORDS_SIZE;
    const fy = ((y - box.top) / box.height) * WORDS_SIZE;
    const near = Math.hypot((fx % 1) - 0.5, (fy % 1) - 0.5) < 0.38;
    return fx >= 0 && fy >= 0 && fx < WORDS_SIZE && fy < WORDS_SIZE && near ? Math.floor(fy) * WORDS_SIZE + Math.floor(fx) : null;
  };

  if (state.over) {
    return (
      <div className="flex w-full max-w-lg flex-col gap-4">
        <p className="text-center text-lg font-bold">{tr.live.timeUp}</p>
        {state.found.map((words, seat) => (
          <div key={seat}>
            <p className="text-sm font-semibold">
              {nameOf(seat)} · {tr.live.points(state.scores[seat]!)}
            </p>
            <p className="text-sm text-stone-600 dark:text-stone-300">{words?.join(" · ") || "—"}</p>
          </div>
        ))}
        {state.missed.length > 0 && (
          <div>
            <p className="text-sm font-semibold">{tr.live.missed}</p>
            <p className="text-sm text-stone-500">{state.missed.join(" · ")}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {seconds !== null && (
        <p className={`font-mono text-xl font-bold tabular-nums ${seconds <= 10 ? "animate-pulse text-red-600" : ""}`}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </p>
      )}
      <div className="flex h-11 items-center gap-2">
        <span className={`min-w-32 text-center font-mono text-2xl font-bold tracking-widest ${note ? (note.good ? "text-green-600" : "text-red-600") : ""}`}>
          {note && !word ? note.text : word || "·"}
        </span>
        {word && (
          <>
            <button
              type="button"
              onClick={() => setPath([])}
              aria-label={tr.common.close}
              className="grid size-9 place-items-center rounded-full bg-stone-200 dark:bg-stone-800"
            >
              <X className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={word.length < WORDS_MIN}
              aria-label={tr.common.send}
              className="grid size-9 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-40"
            >
              <Check className="size-5" />
            </button>
          </>
        )}
      </div>
      <div
        ref={grid}
        className="grid aspect-square w-full max-w-[22rem] touch-none grid-cols-4 gap-2 select-none"
        onPointerDown={(e) => {
          const tile = tileAt(e.clientX, e.clientY);
          if (tile === null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { moved: false };
          setPath((p) =>
            p.at(-1) === tile
              ? p.slice(0, -1)
              : p.length && !p.includes(tile) && neighbours(p.at(-1)!, tile)
                ? [...p, tile]
                : [tile],
          );
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const tile = tileAt(e.clientX, e.clientY);
          if (tile === null) return;
          setPath((p) => {
            const next = extend(p, tile);
            if (next !== p) drag.current!.moved = true;
            return next;
          });
        }}
        onPointerUp={() => {
          if (drag.current?.moved) void submit();
          drag.current = null;
        }}
      >
        {state.grid.map((letter, i) => (
          <div
            key={i}
            className={`grid place-items-center rounded-2xl text-3xl font-black shadow-sm ring-1 transition ${
              path.includes(i)
                ? "scale-95 bg-brand text-brand-ink ring-brand"
                : "bg-white ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
            }`}
          >
            {letter}
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">{tr.live.findWords}</p>
      {mine.length > 0 && (
        <div className="flex max-w-lg flex-wrap justify-center gap-1.5">
          {[...mine].reverse().map((w) => (
            <span key={w} className="rounded-full bg-black/5 px-2.5 py-1 text-sm dark:bg-white/10">
              {w} <span className="text-xs text-stone-500">+{wordPoints(w)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
