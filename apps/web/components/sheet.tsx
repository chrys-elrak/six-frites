"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-sm space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-stone-900">
          {title && (
            <div className="border-b border-stone-200 px-4 py-3 text-center text-sm text-stone-500 dark:border-stone-800">
              {title}
            </div>
          )}
          {actions.map((a, i) => (
            <button
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
          onClick={onClose}
          className="block w-full rounded-2xl bg-white py-3.5 text-[17px] font-semibold shadow-xl hover:bg-stone-50 dark:bg-stone-900 dark:hover:bg-stone-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
