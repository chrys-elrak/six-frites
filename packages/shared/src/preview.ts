import { type MessageDTO, type MessageType, maskSpoilers } from "./chats.js";
import { chatTheme, customThemeColor } from "./chat-themes.js";
import type { Dict } from "./i18n/index.js";

const DURATIONS = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
] as const;

/** Names an auto-delete timer in the largest whole unit, e.g. 604800 → "1 week". */
export function durationLabel(secs: number, t: Dict) {
  const [unit, size] = DURATIONS.find(([, size]) => secs % size === 0) ?? ["second", 1];
  return t.time.duration(secs / size, unit);
}

/** A chat theme's name in the reader's language. */
export const themeName = (id: string | null | undefined, t: Dict) =>
  customThemeColor(id) ? t.summary.themes.custom : t.summary.themes[chatTheme(id).id as keyof Dict["summary"]["themes"]];

/** How a notification describes someone reacting to your message. */
export function reactionText(emoji: string, m: MessageDTO, t: Dict) {
  const preview = previewText(m, t);
  return preview ? t.summary.reacted(emoji, preview) : t.summary.reactedToYours(emoji);
}

const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

/** "Video call · 2:31" or "Missed voice call". */
export function callText(a: { video: boolean; secs: number | null }, t: Dict) {
  return a.secs === null ? t.summary.missedCall(a.video) : t.summary.call(a.video, clock(a.secs));
}

/** What a service message says, without the sender's name. */
export function serviceText(m: Pick<MessageDTO, "action">, t: Dict) {
  const a = m.action;
  if (a?.type === "theme") return a.theme ? t.summary.background(themeName(a.theme, t)) : t.summary.backgroundReset;
  if (a?.type === "e2ee") return t.summary.encrypted;
  if (a?.type === "call") return callText(a, t);
  return a?.secs ? t.summary.autoDeleteAfter(durationLabel(a.secs, t)) : t.summary.autoDeleteOff;
}

/** What a service message says as a sentence about its sender; `who` is null when it was you. */
export function serviceSentence(m: Pick<MessageDTO, "action">, who: string | null, t: Dict) {
  const a = m.action;
  if (a?.type === "theme") {
    if (!a.theme) return t.summary.resetBackground(who);
    return customThemeColor(a.theme)
      ? t.summary.customBackground(who)
      : t.summary.changedBackground(who, themeName(a.theme, t));
  }
  if (a?.type === "e2ee") return t.summary.turnedOnEncryption(who);
  if (a?.type === "call") return t.summary.called(who, callText(a, t));
  return a?.secs ? t.summary.setAutoDelete(who, durationLabel(a.secs, t)) : t.summary.turnedOffAutoDelete(who);
}

/** What a message shows as: GIFs and stickers sent from the keyboard travel as images. */
export function shownType(m: Pick<MessageDTO, "type" | "attachment"> & { file?: { sticker?: boolean } }): MessageType {
  if (m.type !== "image") return m.type;
  if (m.file?.sticker) return "sticker";
  return m.attachment?.mime === "image/gif" ? "gif" : "image";
}

/**
 * A one-line description of a message for chat previews and notifications. Never reveals spoilers
 * or self-destructing content.
 */
export function previewText(m: MessageDTO & { file?: { sticker?: boolean } }, t: Dict) {
  const type = shownType(m);
  if (type === "service") return serviceText(m, t);
  if (m.ephemeral) return t.summary.selfDestructing;
  if (m.deletedAt) return t.summary.messageDeleted;
  if (type === "sticker") return m.sticker ? `${m.sticker.emoji} ${t.summary.kinds.sticker}` : t.summary.kinds.sticker;
  const caption = m.text ? (m.spoiler && m.type === "text" ? t.summary.spoiler : maskSpoilers(m.text, m.entities)) : "";
  if (type === "text") return caption;
  const label = type === "file" && m.attachment ? t.summary.fileNamed(m.attachment.name) : t.summary.kinds[type];
  return caption ? `${label} · ${caption}` : label;
}
