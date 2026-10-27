"use client";

import { useRef } from "react";

const TRIGGER = 64;

/**
 * Drag a row toward the middle with a finger to fire `onSwipe`, like replying in Messenger: right for their
 * messages, left (`dir` -1) for yours. Vertical drags are left to the scroller, so the row needs
 * `touch-action: pan-y`. Moves `moving` and fades in `hint` straight through the DOM so a long chat doesn't
 * re-render on every finger move.
 */
export function useSwipe(onSwipe: (() => void) | null, dir: 1 | -1) {
  const moving = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dx = useRef(0);

  const move = (x: number, animate: boolean) => {
    dx.current = x;
    const transition = animate ? "transform 200ms, opacity 200ms" : "none";
    if (moving.current) {
      moving.current.style.transition = transition;
      moving.current.style.transform = x ? `translateX(${x * dir}px)` : "";
    }
    if (hint.current) {
      const shown = Math.min(x / TRIGGER, 1);
      hint.current.style.transition = transition;
      hint.current.style.opacity = String(shown);
      hint.current.style.transform = `scale(${0.5 + shown / 2})`;
    }
  };

  const reset = () => {
    start.current = null;
    dragging.current = false;
    if (dx.current) move(0, true);
  };

  return {
    moving,
    hint,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (onSwipe && e.pointerType === "touch") start.current = { x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        const x = (e.clientX - s.x) * dir;
        const y = e.clientY - s.y;
        if (!dragging.current) {
          if (Math.hypot(x, y) < 10) return;
          if (x <= Math.abs(y)) return reset();
          dragging.current = true;
        }
        const pulled = Math.max(0, x < TRIGGER ? x : TRIGGER + (x - TRIGGER) / 3);
        if (pulled >= TRIGGER && dx.current < TRIGGER) navigator.vibrate?.(10);
        move(pulled, false);
      },
      onPointerUp: () => {
        if (dx.current >= TRIGGER) onSwipe?.();
        reset();
      },
      onPointerCancel: reset,
    },
  };
}
