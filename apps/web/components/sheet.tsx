"use client";

import { Check } from "lucide-react";
import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";

export interface SheetAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  keepOpen?: boolean;
  checked?: boolean;
}

export function Sheet({
  title,
  actions,
  onClose,
  children,
  at,
}: {
  title?: React.ReactNode;
  actions: SheetAction[];
  onClose: () => void;
  children?: React.ReactNode;
  /** Shows a context menu at this point, as for a right-click, instead of the sheet. */
  at?: { x: number; y: number };
}) {
  const tr = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const select = (a: SheetAction) => {
    if (!a.keepOpen) onClose();
    a.onSelect();
  };

  const place = (el: HTMLDivElement | null) => {
    if (!el || !at) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, at.x + width > window.innerWidth - 8 ? at.x - width : at.x)}px`;
    el.style.top = `${Math.max(8, at.y + height > window.innerHeight - 8 ? at.y - height : at.y)}px`;
  };

  if (at) {
    const picking = actions.some((a) => a.checked !== undefined);
    return (
      <Portal>
        <div
          className="fixed inset-0 z-[80]"
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <button type="button" aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 cursor-default" />
          <div ref={place} className="fixed flex w-max flex-col items-start gap-2">
            {children}
            <div
              role="menu"
              className={`max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl bg-white/95 p-1 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:bg-stone-900/95 dark:ring-white/10 ${
                picking ? "min-w-40" : "w-56"
              }`}
            >
              {actions.map((a, i) => (
                <button
                  type="button"
                  role={picking ? "menuitemradio" : "menuitem"}
                  aria-checked={a.checked}
                  key={a.label}
                  autoFocus={a.checked ?? i === 0}
                  onClick={() => select(a)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-stone-100 focus:outline-none focus-visible:bg-stone-100 dark:hover:bg-stone-800 dark:focus-visible:bg-stone-800 ${
                    a.destructive ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
                  } ${a.checked ? "font-semibold" : ""}`}
                >
                  {picking && <Check className={`size-4 shrink-0 text-brand ${a.checked ? "" : "invisible"}`} />}
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal>
        <button
          type="button"
          aria-label={tr.common.close}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        />
        <div className="relative w-full max-w-sm space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
          {children}
          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-xl dark:bg-stone-900">
            {title && (
              <div className="border-b border-stone-200 px-4 py-3 text-center text-sm text-stone-500 dark:border-stone-800">
                {title}
              </div>
            )}
            {actions.map((a, i) => (
              <button
                type="button"
                key={a.label}
                autoFocus={i === 0}
                onClick={() => select(a)}
                className={`block w-full border-b border-stone-100 px-4 py-3.5 text-center text-[17px] last:border-0 hover:bg-stone-50 focus:bg-stone-50 focus:outline-none dark:border-stone-800 dark:hover:bg-stone-800 dark:focus:bg-stone-800 ${
                  a.destructive ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="block w-full rounded-2xl bg-white py-3.5 text-[17px] font-semibold shadow-xl hover:bg-stone-50 dark:bg-stone-900 dark:hover:bg-stone-800"
          >
            {tr.common.cancel}
          </button>
        </div>
      </div>
    </Portal>
  );
}
