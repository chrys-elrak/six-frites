"use client";

import { placeMessageMenu, placeReactionBar } from "@six/shared";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useMedia } from "@/lib/viewport";
import { Portal } from "./portal";
import { ActionBar, Sheet, type SheetAction } from "./sheet";

/**
 * A message's long-press menu, Messenger style: the screen dims except for the message and `children` (the reaction
 * bar) sits right on top of it. On a narrow screen the actions line up as icons in a bar at the bottom, on a wide one
 * they open in a card next to the message. Without `rect` it is the usual sheet or right-click menu.
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
  const narrow = useMedia("(width < 48rem)");
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

  const placeCard = (card: HTMLDivElement | null) => {
    if (!card) return;
    const size = (el: HTMLElement) => ({ width: el.offsetWidth, height: el.offsetHeight });
    const screen = { top: 8, bottom: window.innerHeight - 8, width: window.innerWidth };
    const spot = placeMessageMenu(rect, bar.current && size(bar.current), size(card), screen, mine);
    const put = (el: HTMLElement | null, to: { top: number; left: number } | null) =>
      el && to && Object.assign(el.style, { top: `${to.top}px`, left: `${to.left}px`, visibility: "visible" });
    if (at) {
      const { width, height } = size(card);
      spot.card = {
        left: Math.max(8, at.x + width > screen.width - 8 ? at.x - width : at.x),
        top: Math.max(8, at.y + height > screen.bottom ? at.y - height : at.y),
      };
      if (bar.current) spot.bar = placeReactionBar(rect, size(bar.current), screen, mine);
    }
    put(bar.current, spot.bar);
    put(card, spot.card);
  };

  const select = (a: SheetAction) => {
    if (!a.keepOpen) onClose();
    a.onSelect();
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
        {narrow ? (
          <ActionBar key="bar" ref={place} actions={actions} onSelect={select} />
        ) : (
          <div
            key="card"
            ref={placeCard}
            className="chat-colors invisible fixed flex max-h-[calc(100dvh-1rem)] min-w-52 flex-col overflow-y-auto rounded-2xl bg-(--bubble-their)/80 py-1 shadow-xl ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 dark:ring-white/10"
          >
            {actions.map((a, i) => (
              <button
                key={a.label}
                type="button"
                autoFocus={i === 0}
                onClick={() => select(a)}
                className={`px-4 py-2.5 text-left text-[15px] font-medium whitespace-nowrap hover:bg-brand/20 focus:outline-none focus-visible:bg-brand/20 ${
                  a.destructive ? "text-red-600 dark:text-red-400" : "text-(--bubble-their-ink)"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Portal>
  );
}
