import type { MessageDTO } from "@six/shared";
import { CircleUserRound, Image as ImageIcon, Mic, Paperclip, Video } from "lucide-react-native";

const mediaLabels = {
  image: { Icon: ImageIcon, label: "Photo" },
  video: { Icon: Video, label: "Video" },
  video_note: { Icon: CircleUserRound, label: "Video message" },
  voice: { Icon: Mic, label: "Voice message" },
  file: { Icon: Paperclip, label: "File" },
} as const;

export type MediaType = Exclude<MessageDTO["type"], "text">;

export const mediaLabel = (type: MediaType) => mediaLabels[type].label;

export function MediaIcon({ type, color, size = 14 }: { type: MediaType; color: string; size?: number }) {
  const { Icon } = mediaLabels[type];
  return <Icon size={size} color={color} />;
}
