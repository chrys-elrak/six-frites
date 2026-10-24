"use client";

import { useEffect } from "react";
import { Portal } from "./portal";

export function Dialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
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
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        />
        <div className="relative w-full max-w-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
          <div className="max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-xl dark:bg-stone-900">
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
}
