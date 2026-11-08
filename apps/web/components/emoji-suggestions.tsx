"use client";

import { type EmojiEntry, emojiQuery, suggestEmoji } from "@six/shared";
import { useEffect, useState } from "react";
import { emojiList } from "@/lib/emoji";
import { useT } from "@/lib/i18n";

/**
 * Emoji named like the `:name` typed right before the caret, as in Telegram. Picking one hands `replace` the
 * text with the emoji in place of `:name`, and where the caret goes.
 */
export function useEmojiSuggestions(
  text: string,
  caret: number,
  replace: (text: string, caret: number) => void,
  enabled = true,
) {
  const [suggested, setSuggested] = useState<{ start: number; end: number; items: EmojiEntry[] } | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const q = enabled ? emojiQuery(text, caret) : null;
    if (!q) return setSuggested(null);
    let live = true;
    void emojiList().then((list) => {
      if (!live) return;
      setSuggested({ start: q.start, end: caret, items: suggestEmoji(list, q.query) });
      setActive(0);
    });
    return () => {
      live = false;
    };
  }, [text, caret, enabled]);

  function pick(emoji: string) {
    if (!suggested) return;
    setSuggested(null);
    replace(text.slice(0, suggested.start) + emoji + text.slice(suggested.end), suggested.start + emoji.length);
  }

  /** Arrows move through the suggestions, Enter or Tab picks one, Escape closes them; true when it took the key. */
  function onKey(e: React.KeyboardEvent) {
    const items = suggested?.items;
    if (!items?.length || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      setActive((i) => (i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      pick(items[active]!.e);
    } else if (e.key === "Escape") {
      setSuggested(null);
    } else return false;
    e.preventDefault();
    return true;
  }

  return { items: suggested?.items ?? [], active, setActive, pick, onKey, close: () => setSuggested(null) };
}

export function EmojiSuggestions({
  items,
  active,
  setActive,
  pick,
  className = "",
}: Pick<ReturnType<typeof useEmojiSuggestions>, "items" | "active" | "setActive" | "pick"> & { className?: string }) {
  const tr = useT();
  if (!items.length) return null;
  return (
    <div
      role="listbox"
      aria-label={tr.composer.emojiSuggestions}
      className={`flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-white/70 p-1 shadow-lg ring-1 ring-surface-line backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/70 ${className}`}
    >
      {items.map((x, i) => (
        <button
          key={x.e}
          type="button"
          role="option"
          aria-selected={i === active}
          title={`:${x.n.replace(/ /g, "_")}:`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(x.e)}
          className={`grid size-10 shrink-0 place-items-center rounded-lg text-2xl ${
            i === active ? "bg-brand/20" : ""
          }`}
        >
          {x.e}
        </button>
      ))}
    </div>
  );
}
