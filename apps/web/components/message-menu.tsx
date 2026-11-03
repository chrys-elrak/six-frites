"use client";

import { placeReactionBar } from "@six/shared";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";
import { Sheet, type SheetAction } from "./sheet";

/**
 * A message's long-press menu, like Messenger on Android: the screen dims except for the message, `children` (the
 * reaction bar) sits right on top of it, and the actions line up as icons in a bar at the bottom. Without `rect` it
 * is the usual sheet.
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
  const bar = useRef<HTMLDivElement>(null);
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

  const place = (tools: HTMLDivElement | null) => {
    const el = bar.current;
    if (!tools || !el) return;
    const screen = { top: 8, bottom: window.innerHeight - tools.offsetHeight - 8, width: window.innerWidth };
    const spot = placeReactionBar(rect, { width: el.offsetWidth, height: el.offsetHeight }, screen, mine);
    Object.assign(el.style, { top: `${spot.top}px`, left: `${spot.left}px`, visibility: "visible" });
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
          <div ref={bar} className="invisible fixed max-w-[calc(100vw-1rem)]">
            {children}
          </div>
        )}
        <div
          ref={place}
          className="chat-colors fixed inset-x-0 bottom-0 overflow-x-auto bg-(--bubble-their)/80 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-xl backdrop-saturate-150"
        >
          <div className="flex w-max min-w-full justify-around gap-1">
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              autoFocus={i === 0}
              onClick={() => {
                if (!a.keepOpen) onClose();
                a.onSelect();
              }}
              className={`flex min-w-19 shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs leading-tight font-medium hover:bg-black/5 focus:outline-none focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 ${
                a.destructive ? "text-red-600 dark:text-red-400" : "text-(--bubble-their-ink)"
              }`}
            >
              {a.icon && <a.icon className="size-5.5" />}
              <span className="whitespace-nowrap">{a.label}</span>
            </button>
          ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
