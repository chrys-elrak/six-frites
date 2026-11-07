"use client";

import type { EmojiEntry } from "@six/shared";
import categories from "@six/shared/emojis.json";
import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const CATEGORIES = categories as { title: string; data: EmojiEntry[] }[];
const ALL = CATEGORIES.flatMap((c) => c.data);
const RECENT_KEY = "six:recent-emoji";
const NOTO = { fontFamily: '"Noto Color Emoji", sans-serif' };

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Every emoji, drawn in Noto like the rest of the app: search, recently used first, then each category. */
export function Emojis({ onPick }: { onPick: (emoji: string) => void }) {
  const tr = useT();
  const labels: Record<string, string> = tr.composer.emojiCategories;
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => setRecent(loadRecent()), []);

  const q = query.trim().toLowerCase();
  const sections = q
    ? [{ id: "search", label: null, items: ALL.filter((x) => x.n.includes(q) || x.k.includes(q)).map((x) => x.e) }]
    : [
        ...(recent.length ? [{ id: "recent", label: tr.composer.recent, items: recent }] : []),
        ...CATEGORIES.map((c) => ({ id: c.title, label: labels[c.title] ?? c.title, items: c.data.map((x) => x.e) })),
      ];

  function pick(emoji: string) {
    onPick(emoji);
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, 32);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={window.matchMedia("(pointer: fine)").matches}
        placeholder={tr.composer.searchEmoji}
        className="mx-2 mt-2 appearance-none rounded-lg bg-stone-100 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-stone-800"
      />
      {!q && (
        <div className="flex shrink-0 gap-0.5 overflow-x-auto px-1.5 pt-1.5">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => list.current?.querySelector(`[data-cat="${s.id}"]`)?.scrollIntoView({ block: "start" })}
              aria-label={s.label ?? undefined}
              title={s.label ?? undefined}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              style={NOTO}
            >
              {s.id === "recent" ? <Clock className="size-4.5" /> : s.items[0]}
            </button>
          ))}
        </div>
      )}
      <div ref={list} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5 select-none">
        {sections.map((s) => (
          <section key={s.id} data-cat={s.id}>
            {s.label && (
              <div className="sticky top-0 z-10 bg-white/80 px-1.5 pt-2 pb-1 text-xs font-medium text-stone-500 backdrop-blur-xl dark:bg-stone-900/80">
                {s.label}
              </div>
            )}
            <div className="grid grid-cols-8">
              {s.items.map((e) => (
                <button
                  key={e}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => pick(e)}
                  className="grid aspect-square place-items-center rounded-lg text-2xl leading-none hover:bg-stone-100 dark:hover:bg-stone-800"
                  style={NOTO}
                >
                  {e}
                </button>
              ))}
            </div>
          </section>
        ))}
        {q && !sections[0]!.items.length && <p className="py-8 text-center text-sm text-stone-400">{tr.composer.noEmoji}</p>}
      </div>
    </div>
  );
}
