import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useDrafts } from "@/lib/drafts";
import { useT } from "@/lib/i18n";
import { ChatPicker } from "./chat-picker";

/** A link or text another app shared to Six Frites: pick a chat, and it waits in that chat's message box to send. */
export function SharedLink() {
  const tr = useT();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const text = shareIntent.text || shareIntent.webUrl;
  if (!hasShareIntent || !text) return null;
  return (
    <ChatPicker
      title={tr.messages.forwardTo}
      empty={tr.chats.noChats}
      onClose={() => resetShareIntent()}
      onPick={(chat) => {
        const drafts = useDrafts.getState();
        const before = drafts.byChat[chat.id]?.trim();
        drafts.set(chat.id, before ? `${before} ${text}` : text);
        resetShareIntent();
        router.push(`/chats/${chat.id}`);
      }}
    />
  );
}
