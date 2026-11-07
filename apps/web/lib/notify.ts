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

const DEFAULTS: NotifyPrefs = { sound: true, popups: true, system: false, push: false, tone: "frites" };

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
  href: string;
  title: string;
  body: string;
  avatar: { displayName: string; avatarUrl: string | null };
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

let audio: AudioContext | null = null;

/** Creates or resumes the audio context and starts loading the chosen tone; must run inside a user gesture the first time. */
export function unlockAudio() {
  audio ??= new AudioContext();
  void decode(audio, toneUrl(useNotifyPrefs.getState().tone)).catch(() => null);
  return audio.resume();
}

/** Unlocks audio on the first user gesture, since browsers block sound until the page is interacted with. */
export function primeAudio() {
  const unlock = () => void unlockAudio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

const decoded = new Map<string, Promise<AudioBuffer>>();
const toneUrl = (tone: Tone) => `/tones/${tone}.wav`;
/** Sounds from Pixabay; see public/sounds/Pixabay.txt. */
export const ANON_SOUND = "/sounds/anonymous.mp3";
export const RINGTONE = "/sounds/call.mp3";

function decode(ctx: AudioContext, url: string) {
  let buffer = decoded.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b));
    buffer.catch(() => decoded.delete(url));
    decoded.set(url, buffer);
  }
  return buffer;
}

/** Plays a sound once audio is unlocked; with `loop` it repeats until the returned function stops it. */
export function playSound(url: string, loop = false) {
  const ctx = audio;
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  if (ctx) {
    void Promise.all([decode(ctx, url), ctx.resume()])
      .then(([buffer]) => {
        if (stopped || ctx.state !== "running") return;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.connect(ctx.destination);
        source.start();
      })
      .catch(() => null);
  }
  return () => {
    stopped = true;
    source?.stop();
  };
}

/** Plays the chosen notification tone, or `tone` to try one out. */
export function playTone(tone = useNotifyPrefs.getState().tone) {
  playSound(toneUrl(tone));
}

const FRESH_MS = 60_000;

/** Whether the user is looking at the app: a window that is visible but behind another app doesn't count. */
export const looking = () => document.visibilityState === "visible" && document.hasFocus();

/**
 * Sounds and shows a new message from someone else, unless it was sent silently, its chat is muted or
 * archived, it is the chat on screen, or it is an old message caught up after being offline.
 */
export function notifyIncoming(
  m: MessageDTO,
  chat: ChatDTO | undefined,
  viewing: boolean,
  open: (href: string) => void,
) {
  if (m.silent || chat?.muted || chat?.archived || viewing || Date.now() - Date.parse(m.createdAt) > FRESH_MS) return;
  const sender = chat?.members.find((x) => x.user.id === m.senderId)?.user;
  const t = getT();
  alertUser(
    {
      id: m.id,
      href: `/chats/${m.chatId}`,
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
  open: (href: string) => void,
) {
  if (chat?.muted || chat?.archived || viewing || Date.now() - Date.parse(at) > FRESH_MS) return;
  const reactor = chat?.members.find((x) => x.user.id === r.userId)?.user;
  const t = getT();
  alertUser(
    {
      id: `${r.messageId}:${r.userId}:${r.emoji}`,
      href: `/chats/${r.chatId}`,
      title: reactor?.displayName ?? chat?.title ?? t.summary.newReaction,
      body: message ? reactionText(r.emoji, message, t) : t.summary.reactedToYours(r.emoji),
    },
    reactor?.avatarUrl ?? null,
    open,
  );
}

/** Sounds and shows an anonymous message that just came in, unless the inbox is on screen. */
export function notifyAnon(m: AnonMessageDTO, viewing: boolean, open: (href: string) => void) {
  if (viewing) return;
  const t = getT();
  alertUser(
    {
      id: m.id,
      href: "/inbox",
      title: t.ask.newMessage,
      body:
        maskSpoilers(m.text, m.entities) ||
        (m.voice ? `🎤 ${t.summary.kinds.voice}` : m.gif ? t.summary.kinds.gif : `📷 ${t.summary.kinds.image}`),
    },
    "/icon.svg",
    open,
    ANON_SOUND,
  );
}

/** Tells you a contact reacted to your story. */
export function notifyStoryReaction(e: StoryReactedDTO, open: (href: string) => void) {
  const t = getT();
  alertUser(
    { id: `story-${e.storyId}-${e.user.id}`, href: "/", title: e.user.displayName, body: `${e.emoji} ${e.note ? t.stories.reactedToYourNote : t.stories.reactedToYours}` },
    e.user.avatarUrl,
    open,
  );
}

function alertUser(
  n: { id: string; href: string; title: string; body: string },
  avatarUrl: string | null,
  open: (href: string) => void,
  sound?: string,
) {
  const prefs = useNotifyPrefs.getState();
  const hidden = document.visibilityState !== "visible";

  if (prefs.sound) playSound(sound ?? toneUrl(prefs.tone));
  if (hidden && prefs.push) return;
  if (!looking() && (prefs.system || prefs.push) && "Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(n.title, { body: n.body, icon: avatarUrl ?? "/icon.svg", tag: n.href });
    notification.onclick = () => {
      window.focus();
      open(n.href);
      notification.close();
    };
  } else if (!hidden && prefs.popups) {
    useToasts.getState().push({ ...n, avatar: { displayName: n.title, avatarUrl } });
  }
}
