import type { MessageDTO } from "@six/shared";
import {
  CircleUserRound,
  Film,
  Image as ImageIcon,
  type LucideIcon,
  MessageSquare,
  Mic,
  Paperclip,
  Sticker,
  Timer,
  Video,
} from "lucide-react-native";

const mediaLabels: Record<string, { Icon: LucideIcon; label: string }> = {
  image: { Icon: ImageIcon, label: "Photo" },
  video: { Icon: Video, label: "Video" },
  video_note: { Icon: CircleUserRound, label: "Video message" },
  voice: { Icon: Mic, label: "Voice message" },
  file: { Icon: Paperclip, label: "File" },
  gif: { Icon: Film, label: "GIF" },
  sticker: { Icon: Sticker, label: "Sticker" },
  service: { Icon: Timer, label: "Message" },
};

const fallback = { Icon: MessageSquare, label: "Message" };

export type MediaType = Exclude<MessageDTO["type"], "text">;

export const mediaLabel = (type: MediaType) => (mediaLabels[type] ?? fallback).label;

export function MediaIcon({ type, color, size = 14 }: { type: MediaType; color: string; size?: number }) {
  const { Icon } = mediaLabels[type] ?? fallback;
  return <Icon size={size} color={color} />;
}
