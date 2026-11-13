import { create } from "zustand";

const KEY = "six:chat-layout";

export const CHAT_LAYOUTS = ["bubbles", "compact"] as const;
export type ChatLayout = (typeof CHAT_LAYOUTS)[number];

const saved = (): ChatLayout => {
  try {
    return typeof window !== "undefined" && localStorage.getItem(KEY) === "compact" ? "compact" : "bubbles";
  } catch {
    return "bubbles";
  }
};

/** How chats are drawn on this device: bubbles on both sides, or everyone down the left under their name, like Slack. */
export const useChatLayout = create<{ layout: ChatLayout }>(() => ({ layout: saved() }));

export function setChatLayout(layout: ChatLayout) {
  useChatLayout.setState({ layout });
  try {
    localStorage.setItem(KEY, layout);
  } catch {}
}
