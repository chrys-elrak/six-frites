import {
  type AnonMessageDTO,
  type ChatDTO,
  type MessageDTO,
  type MessageReactedDTO,
  type StoryReactedDTO,
  type Tone,
  maskSpoilers,
  previewText,
  reactionText,
} from "@six/shared";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import { AppState } from "react-native";
import { create } from "zustand";
import { getT } from "./i18n";
import { useNotifyPrefs } from "./notify-prefs";
import { showBanner } from "./push";

export { type NotifyPrefs, useNotifyPrefs } from "./notify-prefs";

export interface Toast {
  id: string;
  href: string;
  title: string;
  body: string;
  avatar: { displayName: string; avatarUrl: string | null };
  /** A confirmation of something I sent, drawn as a small pill so it can't pass for an incoming message. */
  sent?: boolean;
}

export const useToasts = create<{ toasts: Toast[]; push: (t: Toast) => void; dismiss: (id: string) => void }>(
  (set, get) => ({
    toasts: [],
    push(t) {
      set((s) => ({ toasts: [...s.toasts.filter((x) => x.href !== t.href), t].slice(-3) }));
      setTimeout(() => get().dismiss(t.id), 5000);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);

/** A small pill saying a story or note reply went to `to`; tapping it opens the chat. */
export function toastSent(chatId: string, to: { displayName: string; avatarUrl: string | null }, what: string) {
  useToasts.getState().push({
    id: `sent-${Date.now()}`,
    href: `/chats/${chatId}`,
    title: getT().stories.sentTo(to.displayName),
    body: what,
    avatar: { displayName: to.displayName, avatarUrl: to.avatarUrl },
    sent: true,
  });
}

const TONE_FILES: Record<Tone, number> = {
  frites: require("../../assets/tones/frites.wav"),
  chime: require("../../assets/tones/chime.wav"),
  pop: require("../../assets/tones/pop.wav"),
  ding: require("../../assets/tones/ding.wav"),
  marimba: require("../../assets/tones/marimba.wav"),
  drop: require("../../assets/tones/drop.wav"),
  trio: require("../../assets/tones/trio.wav"),
  blip: require("../../assets/tones/blip.wav"),
};

/** From Pixabay; see assets/sounds/Pixabay.txt. */
const ANON_SOUND: number = require("../../assets/sounds/anonymous.mp3");
/** Reactions, so they don't sound like a message. */
const NOTIFY_SOUND: number = require("../../assets/sounds/notification.wav");

const players = new Map<number, AudioPlayer>();

export function playSound(asset: number) {
  let player = players.get(asset);
  if (!player) {
    player = createAudioPlayer(asset);
    players.set(asset, player);
  }
  const ready = player;
  void ready.seekTo(0).then(() => ready.play());
}

/** Plays the chosen notification tone, or `tone` to try one out. */
export function playTone(tone = useNotifyPrefs.getState().tone) {
  playSound(TONE_FILES[tone]);
}

const FRESH_MS = 60_000;

/**
 * Sounds and shows a new message from someone else, unless it was sent silently, its chat is muted or
 * archived, it is the chat on screen, or it is an old message caught up after being offline. In the background the push
 * notification covers it.
 */
export function notifyIncoming(m: MessageDTO, chat: ChatDTO | undefined, viewing: boolean) {
  if (m.silent || chat?.muted || chat?.archived || viewing || Date.now() - Date.parse(m.createdAt) > FRESH_MS) return;
  const sender = chat?.members.find((x) => x.user.id === m.senderId)?.user;
  const t = getT();
  const title = sender?.displayName ?? chat?.title ?? t.summary.newMessage;
  alert(m.id, `/chats/${m.chatId}`, title, previewText(m, t) || t.summary.newMessage, sender?.avatarUrl ?? null);
}

/** Sounds and shows an anonymous message that just came in, unless the inbox is on screen. */
export function notifyAnon(m: AnonMessageDTO, viewing: boolean) {
  const t = getT();
  if (viewing) return;
  const media = m.voice ? `🎤 ${t.summary.kinds.voice}` : m.gif ? t.summary.kinds.gif : `📷 ${t.summary.kinds.image}`;
  alert(m.id, "/inbox", t.ask.newMessage, maskSpoilers(m.text, m.entities) || media, null, ANON_SOUND);
}

/** Tells you a contact reacted to your story. */
export function notifyStoryReaction(e: StoryReactedDTO) {
  const t = getT();
  alert(`story-${e.storyId}-${e.user.id}`, "/", e.user.displayName, `${e.emoji} ${e.note ? t.stories.reactedToYourNote : t.stories.reactedToYours}`, e.user.avatarUrl, NOTIFY_SOUND);
}

function alert(id: string, href: string, title: string, body: string, avatarUrl: string | null, sound?: number) {
  if (AppState.currentState !== "active") return;
  const prefs = useNotifyPrefs.getState();
  if (prefs.sound) playSound(sound ?? TONE_FILES[prefs.tone]);
  if (!prefs.popups) return;
  const tag = href.startsWith("/chats/") ? href.slice("/chats/".length) : href;
  void showBanner(tag, title, body, href)
    .catch(() => false)
    .then((shown) => shown || useToasts.getState().push({ id, href, title, body, avatar: { displayName: title, avatarUrl } }));
}

/** Tells you someone reacted to your message, with the same rules as for new messages. */
export function notifyReaction(
  e: MessageReactedDTO,
  createdAt: string,
  chat: ChatDTO | undefined,
  message: MessageDTO | undefined,
  viewing: boolean,
) {
  if (chat?.muted || chat?.archived || viewing || Date.now() - Date.parse(createdAt) > FRESH_MS) return;
  const reactor = chat?.members.find((x) => x.user.id === e.userId)?.user;
  const t = getT();
  const title = reactor?.displayName ?? chat?.title ?? t.common.someone;
  const body = message ? reactionText(e.emoji, message, t) : t.summary.reactedToYours(e.emoji);
  alert(`${e.messageId}:${e.userId}:${e.emoji}`, `/chats/${e.chatId}`, title, body, reactor?.avatarUrl ?? null, NOTIFY_SOUND);
}
