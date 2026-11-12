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

/**
 * Every emoji, drawn in Noto like the rest of the app: search, recently used first, then each category. Swiping the
 * list sideways jumps to the next or previous category, and the category in view is lit up in the row above.
 */
/**
 * The emoji grid with its search. `compact` drops the category bar, for when a phone's keyboard leaves little room;
 * `onSearching` hears when the search field gets or loses focus.
 */
export function Emojis({ onPick, onSearching, compact = false }: { onPick: (emoji: string) => void; onSearching?: (on: boolean) => void; compact?: boolean }) {
  const tr = useT();
  const labels: Record<string, string> = tr.composer.emojiCategories;
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => setRecent(loadRecent()), []);

  const q = query.trim().toLowerCase();
  const sections = q
    ? [{ id: "search", label: null, items: ALL.filter((x) => x.n.includes(q) || x.k.includes(q)).map((x) => x.e) }]
    : [
        ...(recent.length ? [{ id: "recent", label: tr.composer.recent, items: recent }] : []),
        ...CATEGORIES.map((c) => ({ id: c.title, label: labels[c.title] ?? c.title, items: c.data.map((x) => x.e) })),
      ];

  function current() {
    const el = list.current!;
    const cats = [...el.querySelectorAll<HTMLElement>("[data-cat]")];
    return [...cats].reverse().find((c) => c.offsetTop <= el.scrollTop + 1) ?? cats[0];
  }

  function onScroll() {
    const id = current()?.dataset.cat ?? null;
    if (id === active) return;
    setActive(id);
    tabs.current?.querySelector(`[data-tab="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /** Eases the list back into place from where it is drawn now, or from `from`. */
  function settle(from?: string) {
    const el = list.current!;
    const start = { transform: from ?? (el.style.transform || "none"), opacity: from ? 0.3 : Number(el.style.opacity || 1) };
    el.style.transform = "";
    el.style.opacity = "";
    el.animate([start, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }

  /** Jumps to a category, sliding it in from the side it comes from. */
  function go(id: string) {
    const cats = [...list.current!.querySelectorAll<HTMLElement>("[data-cat]")];
    const from = cats.indexOf(current()!);
    const to = cats.findIndex((c) => c.dataset.cat === id);
    if (to < 0 || to === from) return settle();
    cats[to]!.scrollIntoView({ block: "start" });
    settle(`translateX(${to > from ? 48 : -48}px)`);
  }

  function horizontal(t: { clientX: number; clientY: number } | undefined, min: number) {
    const start = touch.current;
    if (!start || !t || q) return 0;
    const dx = t.clientX - start.x;
    return Math.abs(dx) >= min && Math.abs(dx) >= Math.abs(t.clientY - start.y) * 1.5 ? dx : 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = horizontal(e.touches[0], 12);
    if (!dx) return;
    list.current!.style.transform = `translateX(${dx * 0.35}px)`;
    list.current!.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.4));
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = horizontal(e.changedTouches[0], 50);
    touch.current = null;
    if (!dx) return list.current!.style.transform && settle();
    const cats = [...list.current!.querySelectorAll<HTMLElement>("[data-cat]")];
    const to = cats[cats.indexOf(current()!) + (dx < 0 ? 1 : -1)];
    if (to) go(to.dataset.cat!);
    else settle();
  }

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
        onFocus={() => onSearching?.(true)}
        onBlur={() => onSearching?.(false)}
        placeholder={tr.composer.searchEmoji}
        className="mx-2 mt-2 appearance-none rounded-lg bg-black/5 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-white/10"
      />
      {!q && !compact && (
        <div ref={tabs} className="flex shrink-0 gap-0.5 overflow-x-auto px-1.5 pt-1.5">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              data-tab={s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(s.id)}
              aria-label={s.label ?? undefined}
              title={s.label ?? undefined}
              className={`grid size-8 shrink-0 place-items-center rounded-lg text-lg text-stone-500 hover:bg-black/5 dark:hover:bg-white/10 ${
                (active ?? sections[0]?.id) === s.id ? "bg-brand/20 text-brand" : "opacity-70"
              }`}
              style={NOTO}
            >
              {s.id === "recent" ? <Clock className="size-4.5" /> : s.items[0]}
            </button>
          ))}
        </div>
      )}
      <div
        ref={list}
        onScroll={onScroll}
        onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-1.5 pb-1.5 select-none"
      >
        {sections.map((s) => (
          <section key={s.id} data-cat={s.id}>
            {s.label && (
              <div className="sticky top-0 z-10 bg-stone-50/90 px-1.5 pt-2 pb-1 text-xs font-medium text-stone-500 backdrop-blur-xl dark:bg-stone-950/85">
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
