import * as Haptics from "expo-haptics";
import { type ComponentRef, type RefObject, useRef } from "react";
import type { FlatList, View } from "react-native";
import { useSelection } from "./selection";

type Node = ComponentRef<typeof View>;

const EDGE = 72;

/**
 * Picks every message from the one long-pressed to the one under the finger as it slides, on top of what was already
 * picked, and scrolls the inverted `list` while the finger sits near the top or bottom of `frame`. Messages hand
 * their view to `register` so the one under the finger can be found; `offset` follows the list's scroll position.
 */
export function useDragSelect<T>(list: RefObject<FlatList<T> | null>, frame: RefObject<Node | null>, order: () => string[]) {
  const nodes = useRef(new Map<string, Node>());
  const offset = useRef(0);
  const drag = useRef<{ anchor: string; base: string[]; y: number; last: string; raf: number } | null>(null);

  const pickTo = (id: string) => {
    const d = drag.current;
    if (!d || id === d.last) return;
    const ids = order();
    const a = ids.indexOf(d.anchor);
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) return;
    d.last = id;
    const step = b >= a ? 1 : -1;
    const range: string[] = [];
    for (let i = a; i !== b + step; i += step) range.push(ids[i]!);
    useSelection.getState().set([...d.base, ...range]);
    void Haptics.selectionAsync();
  };
  const under = (y: number) => {
    for (const [id, node] of nodes.current) {
      const r = node.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return id;
    }
  };
  const tick = () => {
    const d = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dy = d.y < 0 ? 0 : d.y < box.top + EDGE ? (box.top + EDGE - d.y) / 3 : d.y > box.bottom - EDGE ? -(d.y - box.bottom + EDGE) / 3 : 0;
    if (dy) {
      offset.current = Math.max(0, offset.current + dy);
      list.current?.scrollToOffset({ offset: offset.current, animated: false });
      const id = under(d.y);
      if (id) pickTo(id);
    }
    d.raf = requestAnimationFrame(tick);
  };

  return {
    register: (id: string | null, node: Node | null) => {
      if (!id) return;
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    onScroll: (y: number) => void (offset.current = y),
    start(anchor: string) {
      const base = useSelection.getState().ids;
      drag.current = { anchor, base, y: -1, last: "", raf: 0 };
      pickTo(anchor);
      drag.current.raf = requestAnimationFrame(tick);
    },
    move(y: number) {
      const d = drag.current;
      if (!d) return;
      d.y = y;
      const id = under(y);
      if (id) pickTo(id);
    },
    end() {
      if (drag.current) cancelAnimationFrame(drag.current.raf);
      drag.current = null;
    },
  };
}
