"use client";

import { useSelection } from "./selection";

const EDGE = 72;

/**
 * Picks every message from `anchor` to the one under the pointer as it slides, on top of what was already picked,
 * and scrolls the list while the pointer sits near its top or bottom edge. Rows carry their message id in
 * `data-pick`. A touch starts it with a long press, which also keeps the page from scrolling under the finger; a
 * mouse starts it on press and only picks once it reaches another message, so a plain click still toggles one.
 */
export function dragSelect({
  anchor,
  mouse,
  order,
  frame,
  scrollBy,
}: {
  anchor: string;
  mouse: boolean;
  order: () => string[];
  frame: HTMLElement;
  scrollBy: (dy: number) => void;
}) {
  const base = useSelection.getState().ids;
  let started = !mouse;
  let x = 0;
  let y = -1;
  let raf = 0;

  const pickTo = (id: string) => {
    const ids = order();
    const a = ids.indexOf(anchor);
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) return;
    const step = b >= a ? 1 : -1;
    const range: string[] = [];
    for (let i = a; i !== b + step; i += step) range.push(ids[i]!);
    useSelection.getState().set([...base, ...range]);
  };
  const under = () => (document.elementFromPoint(x, y)?.closest("[data-pick]") as HTMLElement | null)?.dataset.pick;
  const follow = () => {
    const id = under();
    if (!id) return;
    if (!started && id !== anchor) started = true;
    if (started) pickTo(id);
  };

  const move = (e: PointerEvent) => {
    x = e.clientX;
    y = e.clientY;
    follow();
  };
  const tick = () => {
    const r = frame.getBoundingClientRect();
    const dy = y < 0 || !started ? 0 : y < r.top + EDGE ? -(r.top + EDGE - y) / 3 : y > r.bottom - EDGE ? (y - r.bottom + EDGE) / 3 : 0;
    if (dy) {
      scrollBy(dy);
      follow();
    }
    raf = requestAnimationFrame(tick);
  };
  const block = (e: TouchEvent) => e.preventDefault();
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const end = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("touchmove", block);
    if (mouse && started) {
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("touchmove", block, { passive: false });
  if (started) pickTo(anchor);
  raf = requestAnimationFrame(tick);
}
