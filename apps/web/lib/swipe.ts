"use client";

import { useRef } from "react";

const TRIGGER = 64;

/**
 * Drag a row sideways with a finger to fire `onRight` or `onLeft`, like the chat list in Messenger. Vertical
 * drags are left to the scroller, so the row needs `touch-action: pan-y`. Moves `moving` and fades in the
 * `right` or `left` hint straight through the DOM so a long list doesn't re-render on every finger move.
 */
export function useSwipeRow(onRight: (() => void) | null, onLeft: (() => void) | null) {
  const moving = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const swiped = useRef(false);
  const side = useRef<1 | -1>(1);
  const dx = useRef(0);

  const move = (x: number, animate: boolean) => {
    dx.current = x;
    const transition = animate ? "transform 200ms, opacity 200ms" : "none";
    if (moving.current) {
      moving.current.style.transition = transition;
      moving.current.style.transform = x ? `translateX(${x * side.current}px)` : "";
    }
    const hint = side.current === 1 ? right.current : left.current;
    if (hint) {
      const shown = Math.min(x / TRIGGER, 1);
      hint.style.transition = transition;
      hint.style.opacity = String(shown);
      hint.style.transform = `scale(${0.5 + shown / 2})`;
    }
  };

  const reset = () => {
    start.current = null;
    dragging.current = false;
    if (dx.current) move(0, true);
  };

  return {
    moving,
    right,
    left,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        swiped.current = false;
        if ((onRight || onLeft) && e.pointerType === "touch") start.current = { x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        const x = e.clientX - s.x;
        const y = e.clientY - s.y;
        if (!dragging.current) {
          if (Math.hypot(x, y) < 10) return;
          side.current = x < 0 ? -1 : 1;
          if (Math.abs(x) <= Math.abs(y) || !(side.current === 1 ? onRight : onLeft)) return reset();
          dragging.current = true;
        }
        const along = Math.max(0, x * side.current);
        const pulled = along < TRIGGER ? along : TRIGGER + (along - TRIGGER) / 3;
        if (pulled >= TRIGGER && dx.current < TRIGGER) navigator.vibrate?.(10);
        move(pulled, false);
      },
      onPointerUp: () => {
        swiped.current = dragging.current;
        if (dx.current >= TRIGGER) (side.current === 1 ? onRight : onLeft)?.();
        reset();
      },
      onPointerCancel: reset,
      onClickCapture: (e: React.MouseEvent) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
  };
}

/** One-sided swipe, like replying in Messenger: right for their messages, left (`dir` -1) for yours. */
export function useSwipe(onSwipe: (() => void) | null, dir: 1 | -1) {
  const s = useSwipeRow(dir === 1 ? onSwipe : null, dir === -1 ? onSwipe : null);
  return { moving: s.moving, hint: dir === 1 ? s.right : s.left, handlers: s.handlers };
}
