import type { MessageDTO } from "@six/shared";
import { Lock, Palette, Phone, PhoneMissed, Timer, Video } from "lucide-react";

export function ServiceIcon({ action }: Pick<MessageDTO, "action">) {
  const Icon =
    action?.type === "theme"
      ? Palette
      : action?.type === "e2ee"
        ? Lock
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
export function callLabel(action: { video: boolean; secs: number | null }, outgoing: boolean) {
  const kind = action.video ? "video call" : "voice call";
  if (action.secs === null) return `${outgoing ? "Unanswered" : "Missed"} ${kind}`;
  const clock = `${Math.floor(action.secs / 60)}:${String(action.secs % 60).padStart(2, "0")}`;
  return `${outgoing ? "Outgoing" : "Incoming"} ${kind} · ${clock}`;
}
