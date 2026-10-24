import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ChatDTO, type MessageDTO, type MessageReactedDTO, previewText, reactionText } from "@six/shared";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import { AppState } from "react-native";
import { create } from "zustand";

const PREFS_KEY = "six:notifications";

export interface NotifyPrefs {
  sound: boolean;
  popups: boolean;
  system: boolean;
}

/** Notification settings for this device. */
export const useNotifyPrefs = create<NotifyPrefs & { set: (patch: Partial<NotifyPrefs>) => void }>((set, get) => ({
  sound: true,
  popups: true,
  system: false,
  set(patch) {
    set(patch);
    const { sound, popups, system } = get();
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ sound, popups, system })).catch(() => null);
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

type SystemNotifier = (title: string, body: string, chatId: string) => void;
let systemNotifier: SystemNotifier | null = null;

/** Lets the system-notification module plug in without this file depending on it. */
export function setSystemNotifier(fn: SystemNotifier | null) {
  systemNotifier = fn;
}

const FRESH_MS = 60_000;

/**
 * Sounds and shows a new message from someone else, unless its chat is muted, it is the chat on
 * screen, or it is an old message caught up after being offline.
 */
export function notifyIncoming(m: MessageDTO, chat: ChatDTO | undefined, viewing: boolean) {
  if (chat?.muted || viewing || Date.now() - Date.parse(m.createdAt) > FRESH_MS) return;
  const prefs = useNotifyPrefs.getState();
  const sender = chat?.members.find((x) => x.user.id === m.senderId)?.user;
  const title = sender?.displayName ?? chat?.title ?? "New message";
  const body = previewText(m) || "New message";
  const background = AppState.currentState !== "active";

  if (background) {
    if (prefs.system) systemNotifier?.(title, body, m.chatId);
    return;
  }
  if (prefs.sound) playChime();
  if (prefs.popups) {
    useToasts.getState().push({
      id: m.id,
      chatId: m.chatId,
      title,
      body,
      avatar: { displayName: title, avatarUrl: sender?.avatarUrl ?? null },
    });
  }
}

function alert(id: string, chatId: string, title: string, body: string, avatarUrl: string | null) {
  const prefs = useNotifyPrefs.getState();
  if (AppState.currentState !== "active") {
    if (prefs.system) systemNotifier?.(title, body, chatId);
    return;
  }
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
  const title = reactor?.displayName ?? chat?.title ?? "Someone";
  const body = message ? reactionText(e.emoji, message) : `Reacted ${e.emoji} to your message`;
  alert(`${e.messageId}:${e.userId}:${e.emoji}`, e.chatId, title, body, reactor?.avatarUrl ?? null);
}
