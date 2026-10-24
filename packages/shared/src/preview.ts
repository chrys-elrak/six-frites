import { type MessageDTO, maskSpoilers } from "./chats.js";

const KIND_LABELS: Record<Exclude<MessageDTO["type"], "text">, string> = {
  image: "Photo",
  video: "Video",
  video_note: "Video message",
  voice: "Voice message",
  file: "File",
};

/**
 * A one-line description of a message for chat previews and notifications. Never reveals spoilers
 * or self-destructing content.
 */
export function previewText(m: MessageDTO) {
  if (m.ephemeral) return "Self-destructing message";
  if (m.deletedAt) return "Message deleted";
  const caption = m.text ? (m.spoiler && m.type === "text" ? "Spoiler" : maskSpoilers(m.text, m.entities)) : "";
  if (m.type === "text") return caption;
  const label = m.type === "file" && m.attachment ? `File: ${m.attachment.name}` : KIND_LABELS[m.type];
  return caption ? `${label} · ${caption}` : label;
}
