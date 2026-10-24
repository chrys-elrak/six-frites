import { type ChatDTO, type MessageDTO, previewText } from "@six/shared";
import { create } from "zustand";

const PREFS_KEY = "six:notifications";

export interface NotifyPrefs {
  sound: boolean;
  popups: boolean;
  system: boolean;
  push: boolean;
}

function loadPrefs(): NotifyPrefs {
  const defaults = { sound: true, popups: true, system: false, push: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

/** Notification settings for this device. */
export const useNotifyPrefs = create<NotifyPrefs & { set: (patch: Partial<NotifyPrefs>) => void }>((set, get) => ({
  ...(typeof window === "undefined" ? { sound: true, popups: true, system: false, push: false } : loadPrefs()),
  set(patch) {
    set(patch);
    const { sound, popups, system, push } = get();
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sound, popups, system, push }));
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

/** Creates or resumes the audio context; must run inside a user gesture the first time. */
export function unlockAudio() {
  audio ??= new AudioContext();
  return audio.resume();
}

/** Unlocks audio on the first user gesture, since browsers block sound until the page is interacted with. */
export function primeAudio() {
  const unlock = () => void unlockAudio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function chime(ctx: AudioContext) {
  const now = ctx.currentTime;
  for (const [freq, offset] of [
    [880, 0],
    [1318.5, 0.11],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.4);
  }
}

/** A short two-note chime made with Web Audio, so there is no sound file to ship. */
export function playChime() {
  const ctx = audio;
  if (!ctx) return;
  if (ctx.state === "running") chime(ctx);
  else void ctx.resume().then(() => ctx.state === "running" && chime(ctx));
}

const FRESH_MS = 60_000;

/**
 * Sounds and shows a new message from someone else, unless its chat is muted, it is the chat on
 * screen, or it is an old message caught up after being offline.
 */
export function notifyIncoming(
  m: MessageDTO,
  chat: ChatDTO | undefined,
  viewing: boolean,
  open: (chatId: string) => void,
) {
  if (chat?.muted || viewing || Date.now() - Date.parse(m.createdAt) > FRESH_MS) return;
  const prefs = useNotifyPrefs.getState();
  const sender = chat?.members.find((x) => x.user.id === m.senderId)?.user;
  const title = sender?.displayName ?? chat?.title ?? "New message";
  const body = previewText(m) || "New message";
  const hidden = document.visibilityState !== "visible";

  if (prefs.sound) playChime();
  if (hidden && prefs.push) return;
  if (hidden && prefs.system && "Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body, icon: sender?.avatarUrl ?? "/icon.svg", tag: m.chatId });
    n.onclick = () => {
      window.focus();
      open(m.chatId);
      n.close();
    };
  } else if (!hidden && prefs.popups) {
    useToasts.getState().push({
      id: m.id,
      chatId: m.chatId,
      title,
      body,
      avatar: { displayName: title, avatarUrl: sender?.avatarUrl ?? null },
    });
  }
}
