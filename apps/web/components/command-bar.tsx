"use client";

import { SixApiError } from "@six/sdk";
import { type GifDTO, parseCommand } from "@six/shared";
import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import { useT } from "@/lib/i18n";
import { useGifs } from "./gif-picker";

export interface CommandBarHandle {
  /** Handles a key typed in the composer; true when it was meant for the bar. */
  key: (e: React.KeyboardEvent) => boolean;
  /** Runs the command being typed instead of sending it as text; true when there is one. */
  submit: () => boolean;
}

/** Slash commands over the composer: `/` lists them, `/giphy love` shows GIFs and `/sticker wave` stickers to send. */
export function CommandBar({
  ref,
  text,
  onComplete,
  onGif,
  onSticker,
}: {
  ref: Ref<CommandBarHandle>;
  text: string;
  onComplete: (text: string) => void;
  onGif: (gif: GifDTO) => void;
  onSticker: (sticker: GifDTO) => void;
}) {
  const tr = useT();
  const command = parseCommand(text);
  const search = command?.kind === "run" ? command.args : null;
  const kind = command?.kind === "run" && command.name === "sticker" ? "sticker" : "gif";
  const [q, setQ] = useState(search);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const gifs = useGifs(q ?? "", search !== null && q !== null, kind);
  const names = command?.kind === "names" ? command.names : [];
  const items = search !== null ? (gifs.data?.pages[0]?.items ?? []) : [];
  const count = names.length || items.length;
  const shown = command !== null && dismissed !== text;

  useEffect(() => setActive(0), [q, command?.kind]);

  function pick(i: number) {
    if (names.length) onComplete(`/${names[i]} `);
    else if (items[i]) (kind === "sticker" ? onSticker : onGif)(items[i]);
  }

  useImperativeHandle(ref, () => ({
    key(e) {
      if (!shown || e.nativeEvent.isComposing) return false;
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && count) {
        setActive((i) => (i + (e.key === "ArrowRight" ? 1 : count - 1)) % count);
      } else if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Tab" && count)) {
        pick(Math.min(active, count - 1));
      } else if (e.key === "Escape") {
        setDismissed(text);
      } else return false;
      e.preventDefault();
      return true;
    },
    submit() {
      if (!shown) return false;
      pick(Math.min(active, count - 1));
      return true;
    },
  }));

  if (!shown) return null;
  const unavailable = gifs.error instanceof SixApiError && gifs.error.code === "GIFS_UNAVAILABLE";
  const notice = names.length
    ? null
    : unavailable
      ? tr.composer.gifsUnavailable
      : gifs.isError
        ? kind === "sticker"
          ? tr.composer.couldNotLoadStickers
          : tr.composer.couldNotLoadGifs
        : !gifs.data
          ? tr.common.loading
          : items.length
            ? null
            : kind === "sticker"
              ? tr.composer.noStickersFound
              : tr.composer.noGifs;
  const option = (i: number) => ({
    role: "option",
    "aria-selected": i === active,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onMouseEnter: () => setActive(i),
    onClick: () => pick(i),
  });

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      {names.length ? (
        <div role="listbox" aria-label={tr.composer.commands} className="p-1">
          {names.map((name, i) => (
            <button
              key={name}
              type="button"
              {...option(i)}
              className={`flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                i === active ? "bg-stone-100 dark:bg-stone-800" : ""
              }`}
            >
              <span className="font-medium">/{name}</span>
              <span className="truncate text-stone-500">{tr.composer.commandHints[name]}</span>
            </button>
          ))}
        </div>
      ) : notice ? (
        <p className="px-3 py-4 text-center text-sm text-stone-400">{notice}</p>
      ) : (
        <>
          <div role="listbox" aria-label={tr.composer.pickerTabs[kind]} className="flex gap-1 overflow-x-auto p-1">
            {items.map((g, i) => (
              <button
                key={g.id}
                type="button"
                {...option(i)}
                ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                title={g.title}
                className={`h-24 shrink-0 overflow-hidden rounded-lg ${kind === "sticker" ? "" : "bg-stone-100 dark:bg-stone-800"} ${
                  i === active ? "ring-2 ring-brand ring-inset" : ""
                }`}
                style={{ aspectRatio: `${g.width} / ${g.height}` }}
              >
                <img
                  src={g.previewUrl}
                  alt={g.title}
                  draggable={false}
                  className={`size-full ${kind === "sticker" ? "object-contain" : "object-cover"}`}
                />
              </button>
            ))}
          </div>
          <p className="px-3 pb-1 text-[11px] text-stone-400">{tr.composer.poweredByGiphy}</p>
        </>
      )}
    </div>
  );
}
