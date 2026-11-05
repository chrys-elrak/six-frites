"use client";

import { AUTO_DELETE, AUTO_DELETE_UNITS, durationLabel } from "@six/shared";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Portal } from "./portal";
import { PrimaryButton } from "./ui";

type Unit = (typeof AUTO_DELETE_UNITS)[number][0];
type Units = readonly (readonly [Unit, number])[];

function initial(secs: number | null, units: Units, fallback: number): { amount: string; unit: Unit } {
  const [unit, size] = [...units].reverse().find(([, size]) => (secs ?? fallback) % size === 0) ?? units[0]!;
  return { amount: String((secs ?? fallback) / size), unit };
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
  const tr = useT();
  return (
    <DurationPicker
      value={value ?? 2 * 86400}
      units={AUTO_DELETE_UNITS}
      range={AUTO_DELETE}
      title={tr.chat.customAutoDelete}
      hint={(label) => tr.chat.autoDeleteHint(peerName, label)}
      rangeHint={tr.chat.autoDeleteRange}
      submit={tr.chat.setTimer}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

/** Asks for an amount of `units` that adds up to between `range.min` and `range.max` seconds. */
export function DurationPicker({
  value,
  units,
  range,
  title,
  hint,
  rangeHint,
  submit,
  onSave,
  onClose,
}: {
  value: number | null;
  units: Units;
  range: { min: number; max: number };
  title: string;
  hint: (label: string) => string;
  rangeHint: string;
  submit: string;
  onSave: (secs: number) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [amount, setAmount] = useState(() => initial(value, units, range.min).amount);
  const [unit, setUnit] = useState<Unit>(() => initial(value, units, range.min).unit);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const n = Number(amount);
  const secs = Number.isInteger(n) && n > 0 ? n * units.find(([u]) => u === unit)![1] : 0;
  const valid = secs >= range.min && secs <= range.max;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center md:items-center"
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <button aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <form
          className="relative w-full max-w-sm space-y-4 rounded-t-3xl bg-white/70 backdrop-blur-xl backdrop-saturate-150 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900/70"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave(secs);
            onClose();
          }}
        >
          <div className="flex items-center">
            <h2 className="flex-1 text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr.common.close}
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
              aria-label={tr.chat.amount}
              className="w-24 rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
            />
            {units.length > 1 ? (
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                aria-label={tr.chat.unit}
                className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
              >
                {units.map(([u]) => (
                  <option key={u} value={u}>
                    {tr.chat.units[u]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="self-center">{tr.chat.units[unit]}</span>
            )}
          </div>
          <p className={`text-sm ${valid ? "text-stone-500" : "text-red-600 dark:text-red-400"}`}>
            {valid ? hint(durationLabel(secs, tr)) : rangeHint}
          </p>
          <PrimaryButton type="submit" className="w-full" disabled={!valid}>
            {submit}
          </PrimaryButton>
        </form>
      </div>
    </Portal>
  );
}
