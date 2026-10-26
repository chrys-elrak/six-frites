import type { Dict, MessageDTO } from "@six/shared";
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
import { getT } from "@/lib/i18n";

const mediaIcons: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  video_note: CircleUserRound,
  voice: Mic,
  file: Paperclip,
  gif: Film,
  sticker: Sticker,
  service: Timer,
};

export type MediaType = Exclude<MessageDTO["type"], "text">;

export const mediaLabel = (type: MediaType, tr: Dict = getT()) =>
  type in tr.summary.kinds ? tr.summary.kinds[type as keyof Dict["summary"]["kinds"]] : tr.common.message;

export function MediaIcon({ type, color, size = 14 }: { type: MediaType; color: string; size?: number }) {
  const Icon = mediaIcons[type] ?? MessageSquare;
  return <Icon size={size} color={color} />;
}
