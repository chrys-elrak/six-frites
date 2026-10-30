"use client";

import { GAME_EMOJI, type GameKind, LIVE_EMOJI, LIVE_GAMES, type LiveGame } from "@six/shared";
import { CircleHelp, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Dialog } from "./dialog";

const isLive = (g: GameKind | LiveGame): g is LiveGame => (LIVE_GAMES as readonly string[]).includes(g);

/** A "?" button that opens the rules of a game, step by step. */
export function HowToPlay({ game, className = "" }: { game: GameKind | LiveGame; className?: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const name = isLive(game) ? tr.live.games[game] : tr.calls[game];
  const emoji = isLive(game) ? LIVE_EMOJI[game] : GAME_EMOJI[game];

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`${tr.howTo.title}: ${name}`}
        title={tr.howTo.title}
        className={`grid size-8 shrink-0 place-items-center rounded-full opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 ${className}`}
      >
        <CircleHelp className="size-5" />
      </button>
      {open && (
        <Dialog onClose={() => setOpen(false)}>
          <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <h2 className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-stone-500">{tr.howTo.title}</span>
              <span className="block truncate font-semibold">
                {emoji} {name}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tr.common.close}
              className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-4" />
            </button>
          </div>
          <ol className="space-y-3 p-4 text-left text-stone-900 dark:text-stone-100">
            {tr.howTo.steps[game].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </Dialog>
      )}
    </>
  );
}
