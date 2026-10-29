"use client";

import { useRef } from "react";

/**
 * The finger is still down when the menu opens, so lifting it would click whatever the menu put under it.
 * Eat that click, but let the next real press through.
 */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener("click", stop, true);
    window.removeEventListener("pointerdown", done, true);
    window.removeEventListener("keydown", done, true);
  };
  window.addEventListener("click", stop, true);
  window.addEventListener("pointerdown", done, true);
  window.addEventListener("keydown", done, true);
}

/** Right-clicks with a mouse also count, and pass the pointer position so a menu can open there. */
export function useLongPress(onLongPress: (at?: { x: number; y: number }) => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const touch = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      touch.current = e.pointerType === "touch";
      if (!touch.current) return;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        clear();
        fired.current = true;
        swallowNextClick();
        navigator.vibrate?.(10);
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      if (fired.current) return;
      fired.current = true;
      swallowNextClick();
      onLongPress(touch.current ? undefined : { x: e.clientX, y: e.clientY });
    },
  };
}
