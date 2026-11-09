"use client";

import type { LucideIcon } from "lucide-react";
import { useCloseOnBack } from "@/lib/back";
import { useT } from "@/lib/i18n";
import { useMedia } from "@/lib/viewport";
import { Portal } from "./portal";

export interface PanelItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Tile colour, for the things to send. */
  color?: string;
  /** What a command does, under its name. */
  hint?: string;
}

function Row({ items, onSelect }: { items: PanelItem[]; onSelect: (item: PanelItem) => void }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max min-w-full justify-around gap-1">
        {items.map((a) => (
          <button
            key={a.label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(a)}
            className="flex min-w-19 shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs leading-tight font-medium text-(--bubble-their-ink) hover:bg-black/5 focus:outline-none focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
          >
            <a.icon className="size-5.5" />
            <span className="whitespace-nowrap">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The paperclip's menu. On a phone, two icon rows at the bottom: things to send, then the slash commands. On a
 * wider screen, things to send as coloured tiles, then the commands with what each does.
 */
export function AttachPanel({ attach, commands, onClose }: { attach: PanelItem[]; commands: PanelItem[]; onClose: () => void }) {
  const tr = useT();
  const narrow = useMedia("(width < 48rem)");
  useCloseOnBack(onClose);
  const select = (item: PanelItem) => {
    onClose();
    item.onSelect();
  };

  if (narrow) {
    return (
      <Portal>
        <div className="fixed inset-0 z-[65]" role="dialog" aria-modal aria-label={tr.common.send}>
          <button
            type="button"
            aria-label={tr.common.close}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="chat-colors fixed inset-x-0 bottom-0 bg-(--bubble-their)/80 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-xl backdrop-saturate-150">
            <Row items={[...attach, ...commands]} onSelect={select} />
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[65] flex items-end justify-center md:items-center" role="dialog" aria-modal aria-label={tr.common.send}>
        <button type="button" aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="relative m-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[85dvh] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-3xl bg-white/85 p-4 shadow-xl backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/85">
          <div className="grid grid-cols-4 gap-y-3">
            {attach.map((a, i) => (
              <button
                key={a.label}
                type="button"
                autoFocus={i === 0}
                onClick={() => select(a)}
                className="group flex flex-col items-center gap-1.5 rounded-xl p-1 focus:outline-none"
              >
                <span
                  className="grid size-12 place-items-center rounded-full text-white shadow-sm transition group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-brand group-focus-visible:ring-offset-2 dark:ring-offset-stone-900"
                  style={{ backgroundColor: a.color }}
                >
                  <a.icon className="size-5.5" />
                </span>
                <span className="line-clamp-2 text-center text-xs leading-tight text-stone-700 dark:text-stone-300">{a.label}</span>
              </button>
            ))}
          </div>
          {commands.length > 0 && (
            <section className="space-y-2">
              <h3 className="px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{tr.composer.commands}</h3>
              <div className="grid gap-1 sm:grid-cols-2">
                {commands.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => select(c)}
                    title={c.hint}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-black/5 focus:outline-none focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                      <c.icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{c.label}</span>
                      {c.hint && <span className="block truncate text-xs text-stone-500">{c.hint}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Portal>
  );
}
