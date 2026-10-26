"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";

export interface SheetAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  keepOpen?: boolean;
}

export function Sheet({
  title,
  actions,
  onClose,
}: {
  title?: React.ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const tr = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
                onClick={() => {
                  if (!a.keepOpen) onClose();
                  a.onSelect();
                }}
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
