"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";
import { Sheet, type SheetAction } from "./sheet";

/**
 * A message's long-press menu, Instagram style: the screen dims except for the message, `children` (the reaction
 * bar) floats right above it and the actions line up at the bottom. Without `rect` it is the usual sheet or
 * right-click menu.
 */
export function MessageMenu({
  rect,
  mine,
  at,
  actions,
  onClose,
  children,
}: {
  rect: DOMRect | null;
  mine: boolean;
  at?: { x: number; y: number };
  actions: SheetAction[];
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const tr = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!rect) {
    return (
      <Sheet actions={actions} at={at} onClose={onClose}>
        {children}
      </Sheet>
    );
  }

  const place = (el: HTMLDivElement | null) => {
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const above = rect.top - height - 8;
    el.style.top = `${above >= 8 ? above : Math.min(rect.bottom + 8, window.innerHeight - height - 96)}px`;
    const left = mine ? rect.right - width : rect.left;
    el.style.left = `${Math.min(Math.max(8, left), window.innerWidth - width - 8)}px`;
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50" role="dialog" aria-modal>
        <button type="button" aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 cursor-default" />
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl shadow-[0_0_0_200vmax_rgb(0_0_0/0.55)]"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
        {children && (
          <div ref={place} className="fixed max-w-[calc(100vw-1rem)]">
            {children}
          </div>
        )}
        <div className="fixed inset-x-0 bottom-0 flex gap-1 overflow-x-auto bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-stone-900">
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              autoFocus={i === 0}
              onClick={() => {
                if (!a.keepOpen) onClose();
                a.onSelect();
              }}
              className={`shrink-0 rounded-xl px-4 py-3 text-sm font-medium whitespace-nowrap hover:bg-stone-100 focus:outline-none focus-visible:bg-stone-100 dark:hover:bg-stone-800 dark:focus-visible:bg-stone-800 ${
                a.destructive ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </Portal>
  );
}
