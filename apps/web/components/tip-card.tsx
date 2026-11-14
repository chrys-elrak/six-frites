"use client";

import { findInText } from "@six/shared";
import { ChevronLeft, Lightbulb, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { BackLink } from "@/lib/back";
import { useT } from "@/lib/i18n";

const KEY = "six:tip";
const today = () => new Date().toDateString();
const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

/**
 * Today's tip about the app: a new one each day, the same on every device, going through the whole list in turn.
 * Closing it hides it until tomorrow.
 */
export function TipCard() {
  const tr = useT();
  const t = tr.tips;
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { closedOn?: string };
      if (saved.closedOn !== today()) setNext(dayNumber());
    } catch {
      setNext(0);
    }
  }, []);

  if (next === null) return null;

  function close() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ closedOn: today() }));
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

/** Takes the tip's place while there's nobody to chat with, as for someone an admin let in, until a friend joins. */
export function InviteNudge({ onInvite }: { onInvite: () => void }) {
  const tr = useT();
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-brand/10 p-3 ring-1 ring-brand/20">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
        <UserPlus className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-brand">{tr.contacts.nobodyYet}</p>
        <p className="text-stone-700 dark:text-stone-300">{tr.contacts.nobodyYetHint}</p>
        <button
          type="button"
          onClick={onInvite}
          className="mt-2.5 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink hover:brightness-105"
        >
          {tr.contacts.inviteFriend}
        </button>
      </div>
    </div>
  );
}

/** The tips holding `query`, ignoring case and accents, each with its number and the part that matched; all of them when it's empty. */
const matchingTips = (list: readonly string[], query: string) =>
  list
    .map((tip, i) => ({ tip, i, hit: query.trim() ? findInText(tip, query, Infinity) : null }))
    .filter((t) => !query.trim() || t.hit);

/** Every tip, numbered, as a page of its own, with a search box. */
export function TipsPage() {
  const tr = useT();
  const [query, setQuery] = useState("");
  const found = matchingTips(tr.tips.list, query);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-black/5 bg-stone-50/45 px-2 py-2 backdrop-blur-xl md:h-16 md:py-0 dark:border-white/10 dark:bg-stone-950/40">
        <BackLink
          href="/"
          aria-label={tr.common.back}
          className="grid size-10 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="size-6" />
        </BackLink>
        <Lightbulb className="size-5 shrink-0 text-brand" />
        <h1 className="min-w-0 flex-1 truncate px-2 font-semibold">{tr.tips.all}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <label className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800">
            <Search className="size-4 shrink-0 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr.tips.search}
              aria-label={tr.tips.search}
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            />
          </label>
        </div>
        <ol className="mx-auto max-w-2xl divide-y divide-black/5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:divide-white/10">
          {found.map(({ tip, i, hit }) => (
            <li key={i} className="flex gap-3 py-3.5 text-[15px]">
              <span className="w-6 shrink-0 text-right font-semibold text-brand tabular-nums">{i + 1}</span>
              <span className="text-stone-700 dark:text-stone-300">
                {hit ? (
                  <>
                    {hit.before}
                    <mark className="rounded bg-brand/25 text-inherit">{hit.match}</mark>
                    {hit.after}
                  </>
                ) : (
                  tip
                )}
              </span>
            </li>
          ))}
        </ol>
        {!found.length && <p className="px-4 py-8 text-center text-sm text-stone-500">{tr.tips.noMatch}</p>}
      </div>
    </div>
  );
}
