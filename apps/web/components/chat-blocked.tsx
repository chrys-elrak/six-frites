"use client";

import type { ChatDTO } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, UserX } from "lucide-react";
import { useState } from "react";
import { setBlocked } from "@/lib/actions";
import { useT } from "@/lib/i18n";

/** Takes the composer's place when nobody can write in this chat, saying why. */
export function ChatBlocked({ chat, peerId, peerName }: { chat: ChatDTO; peerId: string; peerName: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function unblock() {
    setBusy(true);
    await setBlocked(qc, chat, peerId, false).catch(() => null);
    setBusy(false);
  }

  const Icon = chat.peerDeleted ? UserX : Ban;
  const text = chat.peerDeleted
    ? tr.chat.peerDeleted
    : chat.blockedByMe
      ? tr.chat.youBlocked(peerName)
      : tr.chat.blockedYou(peerName);

  return (
    <div className="flex items-center gap-3 border-t border-stone-200 bg-stone-50/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <Icon className="size-5 shrink-0 text-stone-400" />
      <p className="min-w-0 flex-1 text-sm text-stone-600 dark:text-stone-300">{text}</p>
      {chat.blockedByMe && !chat.peerDeleted && (
        <button
          onClick={() => void unblock()}
          disabled={busy}
          className="shrink-0 rounded-xl bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
        >
          {tr.common.unblock}
        </button>
      )}
    </div>
  );
}
