"use client";

import {
  CHAT_GAMES,
  type ChatDTO,
  GAME_EMOJI,
  type GameKind,
  LIVE_EMOJI,
  LIVE_GAMES,
  type LiveGame,
  type LiveInviteDTO,
  isBotGame,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { BotGameDialog, BotRow } from "./bot-game";
import { ChatPicker } from "./chat-picker";
import { GameDialog } from "./game";
import { HowToPlay } from "./how-to-play";
import { NewLiveRoom } from "./live-invites";
import { Sheet } from "./sheet";

/** The Games tab: pick a game, then a friend and your move, sent to your chat with them, or the bot. */
export function GamesPanel() {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const { realtime } = useRealtime();
  const [game, setGame] = useState<GameKind | null>(null);
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const [bot, setBot] = useState(false);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">{tr.common.games}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mine.length > 0 && (
          <div className="mx-auto w-full max-w-lg px-4 pt-4 lg:max-w-5xl lg:px-6 lg:pt-6">
            <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
              {tr.live.inProgress}
            </h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {mine.map((r) => (
                <div key={r.roomId} className="flex items-center gap-1 rounded-2xl bg-brand/15 p-3 pr-1 ring-1 ring-brand">
                  <Link href={`/play/${r.roomId}`} className="flex min-w-0 flex-1 items-center gap-3 transition active:scale-[0.98]">
                    <span className="text-2xl">{LIVE_EMOJI[r.game]}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{tr.live.games[r.game]}</span>
                    <span className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink">{tr.live.resume}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEnding(r)}
                    aria-label={tr.live.end}
                    title={tr.live.end}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"
                  >
                    <MoreVertical className="size-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mx-auto w-full max-w-lg px-4 pt-4 lg:max-w-5xl lg:px-6 lg:pt-6">
          <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
            {tr.live.title}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">{tr.live.hint}</p>
        </div>
        <div className="mx-auto grid w-full max-w-lg gap-3 p-4 lg:max-w-5xl lg:grid-cols-3 lg:px-6">
          {LIVE_GAMES.map((g) => (
            <div key={g} className="relative">
              <button
                type="button"
                onClick={() => setLive(g)}
                className="flex size-full items-center pr-11 gap-4 rounded-2xl bg-gradient-to-br from-brand/20 to-white p-4 text-left ring-1 ring-brand/40 transition hover:ring-brand active:scale-[0.98] lg:flex-col lg:p-6 lg:text-center dark:to-stone-900"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-3xl shadow-sm lg:size-20 lg:text-5xl dark:bg-stone-800">
                  {LIVE_EMOJI[g]}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{tr.live.games[g]}</span>
                  <span className="block text-sm text-stone-500 dark:text-stone-400">{tr.live.about[g]}</span>
                </span>
              </button>
              <HowToPlay game={g} className="absolute top-2 right-2" />
            </div>
          ))}
        </div>
        <div className="mx-auto w-full max-w-lg px-4 pt-2 lg:max-w-5xl lg:px-6">
          <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
            {tr.common.games}
          </h2>
        </div>
        <div className="mx-auto grid w-full max-w-lg gap-3 p-4 lg:max-w-5xl lg:grid-cols-3 lg:px-6 lg:pb-6">
          {CHAT_GAMES.map((g) => (
            <div key={g} className="relative">
              <button
                type="button"
                onClick={() => setGame(g)}
                className="flex size-full items-center pr-11 gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-stone-200 transition hover:ring-brand active:scale-[0.98] lg:flex-col lg:p-6 lg:text-center dark:bg-stone-900 dark:ring-stone-800"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand/15 text-3xl lg:size-20 lg:text-5xl">
                  {GAME_EMOJI[g]}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{tr.calls[g]}</span>
                  <span className="block text-sm text-stone-500 dark:text-stone-400">{tr.calls.about[g]}</span>
                </span>
              </button>
              <HowToPlay game={g} className="absolute top-2 right-2" />
            </div>
          ))}
        </div>
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
      {live && <NewLiveRoom game={live} onClose={() => setLive(null)} />}
      {game && !chat && !bot && (
        <ChatPicker
          title={`${GAME_EMOJI[game]} ${tr.calls.playWith}`}
          empty={tr.calls.noOneToPlay}
          onPick={setChat}
          onClose={() => setGame(null)}
          top={isBotGame(game) && <BotRow onPick={() => setBot(true)} />}
          noSupport
        />
      )}
      {game && bot && isBotGame(game) && (
        <BotGameDialog
          kind={game}
          onClose={() => {
            setGame(null);
            setBot(false);
          }}
        />
      )}
      {game && chat && (
        <GameDialog
          initial={game}
          onClose={() => {
            setGame(null);
            setChat(null);
          }}
          onSend={(g) => {
            if (!realtime) return;
            void queueMessage(qc, realtime, chat.id, { text: "", game: g });
            router.push(`/chats/${chat.id}`);
          }}
        />
      )}
    </div>
  );
}
