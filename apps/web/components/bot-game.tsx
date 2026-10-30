"use client";

import { BOT_ID, type BotGame, GAME_EMOJI, type GameMove, type GameMoveDTO, botBoardMove, botGame, gameOver } from "@six/shared";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Dialog } from "./dialog";
import { GameView } from "./game";

/** The bot row at the top of the "Play with…" list. */
export function BotRow({ onPick }: { onPick: () => void }) {
  const tr = useT();
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 border-b border-stone-200 px-4 py-2.5 text-left hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-800"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-xl">🤖</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{tr.calls.bot}</span>
        <span className="block truncate text-xs text-stone-500">{tr.calls.botHint}</span>
      </span>
    </button>
  );
}

/** A game against the bot, played on this device only: the bot opens, you answer, and on the board it takes its turns. */
export function BotGameDialog({ kind, onClose }: { kind: BotGame; onClose: () => void }) {
  const tr = useT();
  const { locale } = useLocale();
  const me = useSession((s) => s.user!);
  const deal = () => ({ id: Math.random(), game: botGame(kind, locale), moves: [] as GameMoveDTO[] });
  const [round, setRound] = useState(deal);
  const { game, moves } = round;
  const over = gameOver(game, BOT_ID, moves, () => null);
  const play = (userId: string, move: GameMove) =>
    setRound((r) => ({ ...r, moves: [...r.moves, { userId, move, at: new Date().toISOString() }] }));

  useEffect(() => {
    if (game.game !== "ttt" && game.game !== "four") return;
    const move = botBoardMove(game, moves);
    if (!move) return;
    const timer = setTimeout(() => play(BOT_ID, move), 700);
    return () => clearTimeout(timer);
  }, [game, moves]);

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">
          {GAME_EMOJI[kind]} {tr.calls.bot}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col items-center p-4">
        <GameView
          key={round.id}
          game={game}
          senderId={BOT_ID}
          moves={moves}
          meId={me.id}
          mine={false}
          nameOf={(id) => (id === BOT_ID ? tr.calls.bot : me.displayName)}
          onPlay={over ? undefined : (move) => play(me.id, move)}
        />
        {over && (
          <button
            type="button"
            onClick={() => setRound(deal())}
            className="mt-3 rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink"
          >
            {tr.calls.playAgain}
          </button>
        )}
      </div>
    </Dialog>
  );
}
