"use client";

import type { ChatDTO } from "@six/shared";
import { X } from "lucide-react";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";

/** A dialog listing the chats I can still write in, to pick one. */
export function ChatPicker({
  title,
  empty,
  onPick,
  onClose,
  top,
}: {
  title: React.ReactNode;
  empty: string;
  onPick: (chat: ChatDTO) => void;
  onClose: () => void;
  top?: React.ReactNode;
}) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const chats = (useChats().data ?? []).filter(
    (c) => !c.blockedByMe && !c.blockedByThem && !c.peerDeleted && c.members.some((m) => m.user.id !== meId),
  );

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      {top}
      {chats.length ? (
        <ul className="max-h-[60dvh] overflow-y-auto py-1">
          {chats.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Avatar user={c.members.find((m) => m.user.id !== meId)!.user} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-6 text-center text-sm text-stone-500">{empty}</p>
      )}
    </Dialog>
  );
}
