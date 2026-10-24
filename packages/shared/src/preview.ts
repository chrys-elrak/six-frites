import { type MessageDTO, maskSpoilers } from "./chats.js";

const KIND_LABELS: Record<Exclude<MessageDTO["type"], "text" | "service">, string> = {
  image: "Photo",
  video: "Video",
  video_note: "Video message",
  voice: "Voice message",
  file: "File",
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

/** What a service message says, without the sender's name. */
export function serviceText(m: Pick<MessageDTO, "action">) {
  const secs = m.action?.secs;
  return secs ? `Messages auto-delete after ${durationLabel(secs)}` : "Auto-delete turned off";
}

/**
 * A one-line description of a message for chat previews and notifications. Never reveals spoilers
 * or self-destructing content.
 */
export function previewText(m: MessageDTO) {
  if (m.type === "service") return serviceText(m);
  if (m.ephemeral) return "Self-destructing message";
  if (m.deletedAt) return "Message deleted";
  const caption = m.text ? (m.spoiler && m.type === "text" ? "Spoiler" : maskSpoilers(m.text, m.entities)) : "";
  if (m.type === "text") return caption;
  const label = m.type === "file" && m.attachment ? `File: ${m.attachment.name}` : KIND_LABELS[m.type];
  return caption ? `${label} · ${caption}` : label;
}
