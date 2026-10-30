import type { Dict, MessageDTO } from "@six/shared";
import { Ghost, Lock, Palette, Phone, PhoneMissed, Timer, Video } from "lucide-react";
import { getT } from "@/lib/i18n";

export function ServiceIcon({ action }: Pick<MessageDTO, "action">) {
  const Icon =
    action?.type === "theme"
      ? Palette
      : action?.type === "e2ee"
        ? Lock
        : action?.type === "vanish"
          ? Ghost
          : action?.type === "call"
            ? action.secs === null
              ? PhoneMissed
              : action.video
                ? Video
                : Phone
            : Timer;
  return <Icon className="size-3.5 shrink-0" />;
}

/** How a logged call reads from my side: "Outgoing video call · 2:31", "Missed voice call", "Unanswered…". */
export function callLabel(action: { video: boolean; secs: number | null }, outgoing: boolean, tr: Dict = getT()) {
  if (action.secs === null) {
    return outgoing ? tr.chats.unansweredCall(action.video) : tr.summary.missedCall(action.video);
  }
  const clock = `${Math.floor(action.secs / 60)}:${String(action.secs % 60).padStart(2, "0")}`;
  return outgoing ? tr.chats.outgoingCall(action.video, clock) : tr.chats.incomingCall(action.video, clock);
}
