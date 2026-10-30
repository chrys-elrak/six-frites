"use client";

import { CHAT_GAMES, type ChatDTO, GAME_EMOJI, type GameKind } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { ChatPicker } from "./chat-picker";
import { GameDialog } from "./game";

/** The Games tab: pick a game, then a friend, then your move; it's sent to your chat with them. */
export function GamesPanel() {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const { realtime } = useRealtime();
  const [game, setGame] = useState<GameKind | null>(null);
  const [chat, setChat] = useState<ChatDTO | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">{tr.common.games}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid w-full max-w-lg gap-3 p-4 lg:max-w-5xl lg:grid-cols-3 lg:p-6">
          {CHAT_GAMES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGame(g)}
              className="flex items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-stone-200 transition hover:ring-brand active:scale-[0.98] lg:flex-col lg:p-6 lg:text-center dark:bg-stone-900 dark:ring-stone-800"
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand/15 text-3xl lg:size-20 lg:text-5xl">
                {GAME_EMOJI[g]}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{tr.calls[g]}</span>
                <span className="block text-sm text-stone-500 dark:text-stone-400">{tr.calls.about[g]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {game && !chat && (
        <ChatPicker
          title={`${GAME_EMOJI[game]} ${tr.calls.playWith}`}
          empty={tr.calls.noOneToPlay}
          onPick={setChat}
          onClose={() => setGame(null)}
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
