import type { ChatDTO } from "@six/shared";
import { useMemo, useRef } from "react";
import { useAppLock } from "./app-lock";
import { useChats } from "./chats";
import { useSession } from "./session";

/** Whether the archive is shut: the account has an app lock and its code wasn't typed for the archive yet. */
export function useArchiveShut() {
  const hasAppLock = useSession((s) => !!s.user?.hasAppLock);
  const open = useAppLock((s) => s.archiveOpen);
  return hasAppLock && !open;
}

/**
 * Whether this chat must stay behind the code: it's archived and the archive is shut. A chat that was already on
 * screen stays open when it's archived from inside it, until it's left.
 */
export function useChatShut(chatId: string, chat: ChatDTO | undefined) {
  const shut = useArchiveShut() && !!chat?.archived;
  const shownFor = useRef<string | null>(null);
  if (!shut && chat) shownFor.current = chatId;
  return shut && shownFor.current !== chatId;
}

/** The archived chats and the people in them, to leave out of contacts, notifications and stories while the archive is shut. */
export function useHiddenByArchive() {
  const shut = useArchiveShut();
  const archived = useChats(true).data;
  const meId = useSession((s) => s.user?.id);
  return useMemo(() => {
    const chats = shut ? (archived ?? []) : [];
    const direct = chats.filter((c) => c.type === "direct");
    return {
      chatIds: new Set(chats.map((c) => c.id)),
      userIds: new Set(direct.flatMap((c) => c.members.map((m) => m.user.id)).filter((id) => id !== meId)),
    };
  }, [shut, archived, meId]);
}
