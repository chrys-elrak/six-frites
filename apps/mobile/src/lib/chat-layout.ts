import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const KEY = "six:chat-layout";

export const CHAT_LAYOUTS = ["bubbles", "compact"] as const;
export type ChatLayout = (typeof CHAT_LAYOUTS)[number];

/** How chats are drawn on this phone: bubbles on both sides, or everyone down the left under their name, like Slack. */
export const useChatLayout = create<{ layout: ChatLayout }>(() => ({ layout: "bubbles" }));

void AsyncStorage.getItem(KEY)
  .then((saved) => saved === "compact" && useChatLayout.setState({ layout: "compact" }))
  .catch(() => null);

export function setChatLayout(layout: ChatLayout) {
  useChatLayout.setState({ layout });
  void AsyncStorage.setItem(KEY, layout).catch(() => null);
}
