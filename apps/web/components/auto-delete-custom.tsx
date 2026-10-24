"use client";

import { AUTO_DELETE, AUTO_DELETE_UNITS, durationLabel } from "@six/shared";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Portal } from "./portal";
import { PrimaryButton } from "./ui";

type Unit = (typeof AUTO_DELETE_UNITS)[number][0];

function initial(secs: number | null): { amount: string; unit: Unit } {
  if (!secs) return { amount: "2", unit: "days" };
  const [unit, size] = [...AUTO_DELETE_UNITS].reverse().find(([, size]) => secs % size === 0) ?? ["hours", 3600];
  return { amount: String(secs / size), unit };
}

export function AutoDeleteCustom({
  value,
  peerName,
  onSave,
  onClose,
}: {
  value: number | null;
  peerName: string;
  onSave: (secs: number) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(() => initial(value).amount);
  const [unit, setUnit] = useState<Unit>(() => initial(value).unit);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const n = Number(amount);
  const secs = Number.isInteger(n) && n > 0 ? n * AUTO_DELETE_UNITS.find(([u]) => u === unit)![1] : 0;
  const valid = secs >= AUTO_DELETE.min && secs <= AUTO_DELETE.max;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        role="dialog"
        aria-modal
        aria-label="Custom auto-delete"
      >
        <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <form
          className="relative w-full max-w-sm space-y-4 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave(secs);
            onClose();
          }}
        >
          <div className="flex items-center">
            <h2 className="flex-1 text-lg font-semibold">Custom auto-delete</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount"
              className="w-24 rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              aria-label="Unit"
              className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
            >
              {AUTO_DELETE_UNITS.map(([u]) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <p className={`text-sm ${valid ? "text-stone-500" : "text-red-600 dark:text-red-400"}`}>
            {valid
              ? `New messages will be deleted for you and ${peerName} ${durationLabel(secs)} after they're sent.`
              : "Pick between 1 hour and 1 year."}
          </p>
          <PrimaryButton type="submit" className="w-full" disabled={!valid}>
            Set timer
          </PrimaryButton>
        </form>
      </div>
    </Portal>
  );
}
