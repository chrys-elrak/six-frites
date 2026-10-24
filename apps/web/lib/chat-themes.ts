import { DEFAULT_CHAT_THEME, chatTheme, isChatThemeId } from "@six/shared";
import { create } from "zustand";

const KEY = "six:chat-theme";

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved && isChatThemeId(saved) ? saved : DEFAULT_CHAT_THEME;
  } catch {
    return DEFAULT_CHAT_THEME;
  }
}

interface ChatThemeState {
  id: string;
  set: (id: string) => void;
}

/** The chat background chosen on this device. */
export const useChatThemeStore = create<ChatThemeState>((set) => ({
  id: typeof window === "undefined" ? DEFAULT_CHAT_THEME : load(),
  set(id) {
    try {
      localStorage.setItem(KEY, id);
    } catch {}
    set({ id });
  },
}));

export const useChatTheme = () => chatTheme(useChatThemeStore((s) => s.id));
