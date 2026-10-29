"use client";

import { CALL_GAMES, type CallGame, type ChatDTO, GAME_EMOJI } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { GameDialog } from "./game";

/** The Games tab: pick a game, then a friend, then your move; it's sent to your chat with them. */
export function GamesPanel() {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const { realtime } = useRealtime();
  const meId = useSession((s) => s.user!.id);
  const chats = useChats();
  const [game, setGame] = useState<CallGame | null>(null);
  const [chat, setChat] = useState<ChatDTO | null>(null);
  const playable = (chats.data ?? []).filter(
    (c) => !c.blockedByMe && !c.blockedByThem && !c.peerDeleted && c.members.some((m) => m.user.id !== meId),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">{tr.common.games}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid w-full max-w-lg gap-3 p-4 lg:max-w-5xl lg:grid-cols-3 lg:p-6">
          {CALL_GAMES.map((g) => (
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
        <Dialog onClose={() => setGame(null)}>
          <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <h2 className="flex-1 font-semibold">
              {GAME_EMOJI[game]} {tr.calls.playWith}
            </h2>
            <button
              type="button"
              onClick={() => setGame(null)}
              aria-label={tr.common.close}
              className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-4" />
            </button>
          </div>
          {playable.length ? (
            <ul className="max-h-[60dvh] overflow-y-auto py-1">
              {playable.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setChat(c)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Avatar user={c.members.find((m) => m.user.id !== meId)!.user} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-stone-500">{tr.calls.noOneToPlay}</p>
          )}
        </Dialog>
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
