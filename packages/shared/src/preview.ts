import { type MessageDTO, maskSpoilers } from "./chats.js";
import { chatTheme, customThemeColor } from "./chat-themes.js";

const KIND_LABELS: Record<Exclude<MessageDTO["type"], "text" | "service">, string> = {
  image: "Photo",
  video: "Video",
  video_note: "Video message",
  voice: "Voice message",
  file: "File",
  gif: "GIF",
  sticker: "Sticker",
};

const DURATIONS = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
] as const;

/** Names an auto-delete timer in the largest whole unit, e.g. 604800 → "1 week". */
export function durationLabel(secs: number) {
  const [unit, size] = DURATIONS.find(([, size]) => secs % size === 0) ?? ["second", 1];
  const n = secs / size;
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** How a notification describes someone reacting to your message. */
export function reactionText(emoji: string, m: MessageDTO) {
  const preview = previewText(m);
  return preview ? `Reacted ${emoji} to “${preview}”` : `Reacted ${emoji} to your message`;
}

/** What a service message says, without the sender's name. */
export function serviceText(m: Pick<MessageDTO, "action">) {
  const a = m.action;
  if (a?.type === "theme") return a.theme ? `Background: ${chatTheme(a.theme).name}` : "Background reset";
  return a?.secs ? `Messages auto-delete after ${durationLabel(a.secs)}` : "Auto-delete turned off";
}

/** What a service message says after the sender's name, e.g. "changed the chat background to Ketchup". */
export function serviceSentence(m: Pick<MessageDTO, "action">) {
  const a = m.action;
  if (a?.type === "theme") {
    if (!a.theme) return "reset the chat background";
    return customThemeColor(a.theme)
      ? "set a custom chat background"
      : `changed the chat background to ${chatTheme(a.theme).name}`;
  }
  return a?.secs ? `set messages to auto-delete after ${durationLabel(a.secs)}` : "turned off auto-delete";
}

/**
 * A one-line description of a message for chat previews and notifications. Never reveals spoilers
 * or self-destructing content.
 */
export function previewText(m: MessageDTO) {
  if (m.type === "service") return serviceText(m);
  if (m.ephemeral) return "Self-destructing message";
  if (m.deletedAt) return "Message deleted";
  if (m.type === "sticker") return m.sticker ? `${m.sticker.emoji} Sticker` : "Sticker";
  const caption = m.text ? (m.spoiler && m.type === "text" ? "Spoiler" : maskSpoilers(m.text, m.entities)) : "";
  if (m.type === "text") return caption;
  const label = m.type === "file" && m.attachment ? `File: ${m.attachment.name}` : KIND_LABELS[m.type];
  return caption ? `${label} · ${caption}` : label;
}
