type Touch = { pageX: number; pageY: number };

/** Where the fingers on screen are centred, how far apart the first two are, and how many there are (at most two). */
export function fingers(touches: readonly Touch[]) {
  const [a, b] = touches;
  if (!a) return { x: 0, y: 0, apart: 0, count: 0 };
  if (!b) return { x: a.pageX, y: a.pageY, apart: 0, count: 1 };
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2, apart: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY), count: 2 };
}
