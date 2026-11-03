"use client";

import { BOT_GAMES, type BotGame, GAME_EMOJI, LIVE_EMOJI, LIVE_GAMES, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { unwrap } from "@six/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { insertMessage } from "@/lib/chats";
import { getLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { HowToPlay } from "./how-to-play";
import { NewLiveRoom } from "./live-invites";
import { Sheet } from "./sheet";

function GameRow({ game, emoji, title, about, onPick }: {
  game: BotGame | LiveGame;
  emoji: string;
  title: string;
  about: string;
  onPick: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-2xl p-2.5 pr-11 text-left ring-1 ring-stone-200 transition hover:ring-brand active:scale-[0.99] dark:ring-stone-800"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/15 text-2xl">{emoji}</span>
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="line-clamp-2 block text-sm text-stone-500 dark:text-stone-400">{about}</span>
        </span>
      </button>
      <HowToPlay game={game} className="absolute top-1/2 right-2 -translate-y-1/2" />
    </div>
  );
}

const heading = "px-1 pt-2 text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400";

/**
 * What Game opens in your chat with Frite Bot: live games you're in, the games it starts in the chat, and live games
 * with friends where it takes the empty seats.
 */
export function BotGames({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const [live, setLive] = useState<LiveGame | null>(null);
  const [mine, setMine] = useState<Omit<LiveInviteDTO, "from">[]>([]);
  const [ending, setEnding] = useState<Omit<LiveInviteDTO, "from"> | null>(null);

  useEffect(() => {
    void realtime?.socket
      .timeout(10_000)
      .emitWithAck("live:mine", {})
      .then((res) => res.ok && setMine(res.data))
      .catch(() => null);
  }, [realtime]);

  function start(kind: BotGame) {
    onClose();
    void six.api
      .POST("/v1/bot/games", { body: { kind, locale: getLocale() } })
      .then((res) => insertMessage(qc, unwrap(res)))
      .catch(() => null);
  }

  if (live) return <NewLiveRoom game={live} onClose={onClose} />;

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">🤖 {tr.calls.bot}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex max-h-[70dvh] flex-col gap-2 overflow-y-auto p-3">
        {mine.length > 0 && <h3 className={heading}>{tr.live.inProgress}</h3>}
        {mine.map((r) => (
          <div key={r.roomId} className="flex items-center gap-1 rounded-2xl bg-brand/15 p-2.5 pr-1 ring-1 ring-brand">
            <Link href={`/play/${r.roomId}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="text-2xl">{LIVE_EMOJI[r.game]}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{tr.live.games[r.game]}</span>
              <span className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink">{tr.live.resume}</span>
            </Link>
            <button
              type="button"
              onClick={() => setEnding(r)}
              aria-label={tr.live.end}
              className="grid size-9 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"
            >
              <MoreVertical className="size-5" />
            </button>
          </div>
        ))}
        <h3 className={heading}>{tr.common.games}</h3>
        {BOT_GAMES.map((g) => (
          <GameRow key={g} game={g} emoji={GAME_EMOJI[g]} title={tr.calls[g]} about={tr.calls.about[g]} onPick={() => start(g)} />
        ))}
        <h3 className={heading}>{tr.live.title}</h3>
        {LIVE_GAMES.map((g) => (
          <GameRow key={g} game={g} emoji={LIVE_EMOJI[g]} title={tr.live.games[g]} about={tr.live.about[g]} onPick={() => setLive(g)} />
        ))}
      </div>
      {ending && (
        <Sheet
          title={tr.live.endHint}
          actions={[
            {
              label: tr.live.end,
              destructive: true,
              onSelect: () => {
                realtime?.socket.emit("live:end", { roomId: ending.roomId });
                setMine((m) => m.filter((r) => r.roomId !== ending.roomId));
              },
            },
          ]}
          onClose={() => setEnding(null)}
        />
      )}
    </Dialog>
  );
}
