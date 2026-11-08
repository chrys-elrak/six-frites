"use client";

import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import Link from "next/link";
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

/** A row in Settings that opens every tip on their own page, for whoever doesn't want to wait for them one a day. */
export function AllTips() {
  const tr = useT();
  return (
    <Link
      href="/tips"
      className="flex w-full items-center gap-3 rounded-2xl bg-surface backdrop-blur-md px-4 py-3 text-left shadow-sm ring-1 ring-surface-line hover:bg-white/80 dark:hover:bg-stone-800/70"
    >
      <Lightbulb className="size-5 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{tr.tips.all}</span>
        <span className="block text-xs text-stone-500">{tr.tips.allHint(tr.tips.list.length)}</span>
      </span>
      <ChevronRight className="size-5 text-stone-400" />
    </Link>
  );
}

/** Every tip, numbered, as a page of its own. */
export function TipsPage() {
  const tr = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-black/5 bg-stone-50/45 px-2 py-2 backdrop-blur-xl md:h-16 md:py-0 dark:border-white/10 dark:bg-stone-950/40">
        <Link
          href="/settings"
          aria-label={tr.common.back}
          className="grid size-10 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <Lightbulb className="size-5 shrink-0 text-brand" />
        <h1 className="min-w-0 flex-1 truncate px-2 font-semibold">{tr.tips.all}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ol className="mx-auto max-w-2xl divide-y divide-black/5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:divide-white/10">
          {tr.tips.list.map((tip, i) => (
            <li key={i} className="flex gap-3 py-3.5 text-[15px]">
              <span className="w-6 shrink-0 text-right font-semibold text-brand tabular-nums">{i + 1}</span>
              <span className="text-stone-700 dark:text-stone-300">{tip}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
