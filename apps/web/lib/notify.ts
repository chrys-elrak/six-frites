import { type ChatDTO, type MessageDTO, type MessageReactedDTO, type Tone, previewText, reactionText } from "@six/shared";
import { create } from "zustand";
import { getT } from "./i18n";

const PREFS_KEY = "six:notifications";

export interface NotifyPrefs {
  sound: boolean;
  popups: boolean;
  system: boolean;
  push: boolean;
  tone: Tone;
}

const DEFAULTS: NotifyPrefs = { sound: true, popups: true, system: false, push: false, tone: "chime" };

function loadPrefs(): NotifyPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

/** Notification settings for this device. */
export const useNotifyPrefs = create<NotifyPrefs & { set: (patch: Partial<NotifyPrefs>) => void }>((set, get) => ({
  ...(typeof window === "undefined" ? DEFAULTS : loadPrefs()),
  set(patch) {
    set(patch);
    const { sound, popups, system, push, tone } = get();
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sound, popups, system, push, tone }));
    } catch {}
  },
}));

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

let audio: AudioContext | null = null;

/** Creates or resumes the audio context and starts loading the chosen tone; must run inside a user gesture the first time. */
export function unlockAudio() {
  audio ??= new AudioContext();
  void decode(audio, useNotifyPrefs.getState().tone).catch(() => null);
  return audio.resume();
}

/** Unlocks audio on the first user gesture, since browsers block sound until the page is interacted with. */
export function primeAudio() {
  const unlock = () => void unlockAudio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

const decoded = new Map<Tone, Promise<AudioBuffer>>();

function decode(ctx: AudioContext, tone: Tone) {
  let buffer = decoded.get(tone);
  if (!buffer) {
    buffer = fetch(`/tones/${tone}.wav`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b));
    buffer.catch(() => decoded.delete(tone));
    decoded.set(tone, buffer);
  }
  return buffer;
}

/** Plays the chosen notification tone, or `tone` to try one out. */
export function playTone(tone = useNotifyPrefs.getState().tone) {
  const ctx = audio;
  if (!ctx) return;
  void Promise.all([decode(ctx, tone), ctx.resume()])
    .then(([buffer]) => {
      if (ctx.state !== "running") return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    })
    .catch(() => null);
}

const FRESH_MS = 60_000;

/**
 * Sounds and shows a new message from someone else, unless it was sent silently, its chat is muted or
 * archived, it is the chat on screen, or it is an old message caught up after being offline.
 */
export function notifyIncoming(
  m: MessageDTO,
  chat: ChatDTO | undefined,
  viewing: boolean,
  open: (chatId: string) => void,
) {
  if (m.silent || chat?.muted || chat?.archived || viewing || Date.now() - Date.parse(m.createdAt) > FRESH_MS) return;
  const sender = chat?.members.find((x) => x.user.id === m.senderId)?.user;
  const t = getT();
  alertUser(
    {
      id: m.id,
      chatId: m.chatId,
      title: sender?.displayName ?? chat?.title ?? t.summary.newMessage,
      body: previewText(m, t) || t.summary.newMessage,
    },
    sender?.avatarUrl ?? null,
    open,
  );
}

/** Tells me someone reacted to my message; `message` is my cached copy, if I have it. */
export function notifyReaction(
  r: MessageReactedDTO,
  at: string,
  message: MessageDTO | undefined,
  chat: ChatDTO | undefined,
  viewing: boolean,
  open: (chatId: string) => void,
) {
  if (chat?.muted || chat?.archived || viewing || Date.now() - Date.parse(at) > FRESH_MS) return;
  const reactor = chat?.members.find((x) => x.user.id === r.userId)?.user;
  const t = getT();
  alertUser(
    {
      id: `${r.messageId}:${r.userId}:${r.emoji}`,
      chatId: r.chatId,
      title: reactor?.displayName ?? chat?.title ?? t.summary.newReaction,
      body: message ? reactionText(r.emoji, message, t) : t.summary.reactedToYours(r.emoji),
    },
    reactor?.avatarUrl ?? null,
    open,
  );
}

function alertUser(
  n: { id: string; chatId: string; title: string; body: string },
  avatarUrl: string | null,
  open: (chatId: string) => void,
) {
  const prefs = useNotifyPrefs.getState();
  const hidden = document.visibilityState !== "visible";

  if (prefs.sound) playTone(prefs.tone);
  if (hidden && prefs.push) return;
  if (hidden && prefs.system && "Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(n.title, { body: n.body, icon: avatarUrl ?? "/icon.svg", tag: n.chatId });
    notification.onclick = () => {
      window.focus();
      open(n.chatId);
      notification.close();
    };
  } else if (!hidden && prefs.popups) {
    useToasts.getState().push({ ...n, avatar: { displayName: n.title, avatarUrl } });
  }
}
