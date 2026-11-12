"use client";

import { type CSSProperties, useCallback, useState } from "react";

export interface Floater {
  id: number;
  emoji: string;
  mine: boolean;
}

/** Emojis that rise and fade over the screen, like reactions during a call. */
export function FloatingReactions({ reactions }: { reactions: Floater[] }) {
  if (!reactions.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[72] overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="call-reaction absolute bottom-28 text-5xl drop-shadow-lg"
          style={
            {
              left: `${(r.mine ? 58 : 12) + ((r.id * 37) % 26)}%`,
              "--drift": `${r.id % 2 ? 28 : -28}px`,
            } as CSSProperties
          }
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

let next = 0;

/** Emojis to float for a few seconds each, spread across the screen, and a way to add one. */
export function useFloaters() {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const add = useCallback((emoji: string) => {
    const id = ++next;
    setFloaters((all) => [...all.slice(-20), { id, emoji, mine: id % 2 === 0 }]);
    setTimeout(() => setFloaters((all) => all.filter((f) => f.id !== id)), 3000);
  }, []);
  return [floaters, add] as const;
}
