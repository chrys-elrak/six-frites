"use client";

import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const KEY = "six:tip";
const today = () => new Date().toDateString();

/**
 * One tip about the app at a time, at most one a day: closing it moves on to the next one, shown the next day, and
 * the list starts over once it's done. Kept per device, so a fresh one doesn't follow you around.
 */
export function TipCard() {
  const tr = useT();
  const t = tr.tips;
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { next?: number; closedOn?: string };
      if (saved.closedOn !== today()) setNext(saved.next ?? 0);
    } catch {
      setNext(0);
    }
  }, []);

  if (next === null) return null;

  function close() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ next: next! + 1, closedOn: today() }));
    } catch {}
    setNext(null);
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-brand/10 p-3 ring-1 ring-brand/20">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
        <Lightbulb className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-brand">{t.title}</p>
        <p className="text-stone-700 dark:text-stone-300">{t.list[next % t.list.length]}</p>
      </div>
      <button
        type="button"
        onClick={close}
        className="shrink-0 self-center rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink hover:brightness-105"
      >
        {t.next}
      </button>
    </div>
  );
}
