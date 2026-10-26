import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ChatDTO, type MessageDTO, type MessageReactedDTO, previewText, reactionText } from "@six/shared";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import { AppState } from "react-native";
import { create } from "zustand";
import { getT } from "./i18n";

const PREFS_KEY = "six:notifications";

export interface NotifyPrefs {
  sound: boolean;
  popups: boolean;
}

/** Notification settings for this device. */
export const useNotifyPrefs = create<NotifyPrefs & { set: (patch: Partial<NotifyPrefs>) => void }>((set, get) => ({
  sound: true,
  popups: true,
  set(patch) {
    set(patch);
    const { sound, popups } = get();
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ sound, popups })).catch(() => null);
  },
}));

void AsyncStorage.getItem(PREFS_KEY)
  .then((saved) => saved && useNotifyPrefs.setState(JSON.parse(saved) as Partial<NotifyPrefs>))
  .catch(() => null);

export interface Toast {
  id: string;
  chatId: string;
  title: string;
  body: string;
  avatar: { displayName: string; avatarUrl: string | null };
}

export const useToasts = create<{ toasts: Toast[]; push: (t: Toast) => void; dismiss: (id: string) => void }>(
  (set, get) => ({
    toasts: [],
    push(t) {
      set((s) => ({ toasts: [...s.toasts.filter((x) => x.chatId !== t.chatId), t].slice(-3) }));
      setTimeout(() => get().dismiss(t.id), 5000);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);

let chimePlayer: AudioPlayer | null = null;

export function playChime() {
  chimePlayer ??= createAudioPlayer(require("../../assets/chime.wav"));
  void chimePlayer.seekTo(0).then(() => chimePlayer?.play());
}

const FRESH_MS = 60_000;

/**
 * Sounds and shows a new message from someone else, unless its chat is muted, it is the chat on
 * screen, or it is an old message caught up after being offline. In the background the push
 * notification covers it.
 */
export function notifyIncoming(m: MessageDTO, chat: ChatDTO | undefined, viewing: boolean) {
  if (chat?.muted || viewing || Date.now() - Date.parse(m.createdAt) > FRESH_MS) return;
  const sender = chat?.members.find((x) => x.user.id === m.senderId)?.user;
  const t = getT();
  const title = sender?.displayName ?? chat?.title ?? t.summary.newMessage;
  alert(m.id, m.chatId, title, previewText(m, t) || t.summary.newMessage, sender?.avatarUrl ?? null);
}

function alert(id: string, chatId: string, title: string, body: string, avatarUrl: string | null) {
  if (AppState.currentState !== "active") return;
  const prefs = useNotifyPrefs.getState();
  if (prefs.sound) playChime();
  if (prefs.popups) useToasts.getState().push({ id, chatId, title, body, avatar: { displayName: title, avatarUrl } });
}

/** Tells you someone reacted to your message, with the same rules as for new messages. */
export function notifyReaction(
  e: MessageReactedDTO,
  createdAt: string,
  chat: ChatDTO | undefined,
  message: MessageDTO | undefined,
  viewing: boolean,
) {
  if (chat?.muted || viewing || Date.now() - Date.parse(createdAt) > FRESH_MS) return;
  const reactor = chat?.members.find((x) => x.user.id === e.userId)?.user;
  const t = getT();
  const title = reactor?.displayName ?? chat?.title ?? t.common.someone;
  const body = message ? reactionText(e.emoji, message, t) : t.summary.reactedToYours(e.emoji);
  alert(`${e.messageId}:${e.userId}:${e.emoji}`, e.chatId, title, body, reactor?.avatarUrl ?? null);
}
