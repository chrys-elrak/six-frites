import { STORY_STICKER_SCALE, angleOf, turned } from "@six/shared";

export interface Spot {
  x: number;
  y: number;
  scale: number;
  rotate?: number;
}

type Point = { x: number; y: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const middle = (p: Point[]) => (p.length > 1 ? { x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 } : p[0]!);
const apart = (p: Point[]) => (p.length > 1 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0);
const twist = (p: Point[]) => (p.length > 1 ? angleOf(p[0]!, p[1]!) : 0);

/**
 * Drags something on a story with one finger or the mouse, and resizes and turns it when a second finger lands
 * anywhere and pinches or twists, like a photo. Positions are fractions of `box`. Each time a finger lands or lifts, the gesture
 * carries on from where the thing is then, so it never jumps. `done` says whether it moved, to tell a tap from a drag.
 */
export function dragAndPinch(
  e: React.PointerEvent,
  box: DOMRect,
  start: Spot,
  apply: (s: Spot) => void,
  done?: (moved: boolean) => void,
) {
  const fingers = new Map<number, Point>([[e.pointerId, { x: e.clientX, y: e.clientY }]]);
  let spot = start;
  let moved = false;
  let base = { spot, mid: middle([...fingers.values()]), dist: 0, angle: 0 };
  const rebase = () => {
    const p = [...fingers.values()].slice(0, 2);
    base = { spot, mid: middle(p), dist: apart(p), angle: twist(p) };
  };

  const down = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch" || fingers.size >= 2) return;
    ev.preventDefault();
    ev.stopPropagation();
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    rebase();
  };
  const move = (ev: PointerEvent) => {
    if (!fingers.has(ev.pointerId)) return;
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const p = [...fingers.values()].slice(0, 2);
    const mid = middle(p);
    if (!moved && p.length < 2 && Math.hypot(mid.x - base.mid.x, mid.y - base.mid.y) < 4) return;
    moved = true;
    const scale = base.dist ? clamp((base.spot.scale * apart(p)) / base.dist, STORY_STICKER_SCALE.min, STORY_STICKER_SCALE.max) : base.spot.scale;
    spot = {
      x: clamp(base.spot.x + (mid.x - base.mid.x) / box.width, 0, 1),
      y: clamp(base.spot.y + (mid.y - base.mid.y) / box.height, 0, 1),
      scale,
      rotate: base.dist ? turned((base.spot.rotate ?? 0) + twist(p) - base.angle) : base.spot.rotate,
    };
    apply(spot);
  };
  const up = (ev: PointerEvent) => {
    if (!fingers.delete(ev.pointerId)) return;
    if (fingers.size) return rebase();
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    done?.(moved);
  };
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}
