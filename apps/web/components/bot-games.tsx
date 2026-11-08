"use client";

import { BOT_GAMES, type BotGame, GAME_EMOJI, LIVE_EMOJI, LIVE_GAMES, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { unwrap } from "@six/sdk";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { insertMessage } from "@/lib/chats";
import { getLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { six } from "@/lib/six";
import { HowToPlay } from "./how-to-play";

const card =
  "relative flex w-28 shrink-0 flex-col max-sm:w-auto items-center gap-1 rounded-2xl p-2.5 pt-3 text-center ring-1 transition active:scale-[0.97]";

function GameCard({ game, emoji, title, onPick }: { game: BotGame | LiveGame; emoji: string; title: string; onPick: () => void }) {
  return (
    <div className={`${card} bg-surface shadow-sm ring-surface-line hover:ring-brand`}>
      <button type="button" onClick={onPick} className="absolute inset-0 rounded-2xl" aria-label={title} />
      <span className="pointer-events-none text-3xl">{emoji}</span>
      <span className="pointer-events-none line-clamp-2 text-xs leading-tight font-semibold">{title}</span>
      <HowToPlay game={game} className="absolute -top-1 -right-1 scale-75" />
    </div>
  );
}

const heading =
  "shrink-0 self-center px-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase [writing-mode:vertical-rl] rotate-180 dark:text-stone-400 max-sm:col-span-full max-sm:self-start max-sm:rotate-0 max-sm:pt-1 max-sm:[writing-mode:horizontal-tb]";

/**
 * What the chat with Six Frites Game shows instead of a message box: live games you're in, the games it plays with
 * you right in the chat, and live games against it that open already started.
 */
export function BotGames() {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const router = useRouter();
  const [mine, setMine] = useState<Omit<LiveInviteDTO, "from">[]>([]);

  useEffect(() => {
    void realtime?.socket
      .timeout(10_000)
      .emitWithAck("live:mine", {})
      .then((res) => res.ok && setMine(res.data))
      .catch(() => null);
  }, [realtime]);

  function start(kind: BotGame) {
    void six.api
      .POST("/v1/bot/games", { body: { kind, locale: getLocale() } })
      .then((res) => insertMessage(qc, unwrap(res)))
      .catch(() => null);
  }

  async function play(game: LiveGame) {
    const res = await realtime?.socket
      .timeout(10_000)
      .emitWithAck("live:create", { game, invite: [], locale: getLocale(), bot: true })
      .catch(() => null);
    if (res?.ok) router.push(`/play/${res.data.id}`);
  }

  return (
    <div className="border-t border-black/5 bg-stone-50/45 pb-[env(safe-area-inset-bottom)] max-sm:h-[min(22rem,45dvh)] max-sm:overflow-y-auto backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/40">
      <div className="flex gap-2 overflow-x-auto p-3 max-sm:grid max-sm:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] max-sm:overflow-x-visible">
        {mine.map((r) => (
          <Link key={r.roomId} href={`/play/${r.roomId}`} className={`${card} bg-brand/15 ring-brand`}>
            <span className="text-3xl">{LIVE_EMOJI[r.game]}</span>
            <span className="line-clamp-1 text-xs font-semibold">{tr.live.games[r.game]}</span>
            <span className="rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-brand-ink">{tr.live.resume}</span>
          </Link>
        ))}
        <h3 className={heading}>{tr.common.games}</h3>
        {BOT_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={GAME_EMOJI[g]} title={tr.calls[g]} onPick={() => start(g)} />
        ))}
        <h3 className={heading}>{tr.live.title}</h3>
        {LIVE_GAMES.map((g) => (
          <GameCard key={g} game={g} emoji={LIVE_EMOJI[g]} title={tr.live.games[g]} onPick={() => void play(g)} />
        ))}
      </div>
    </div>
  );
}
