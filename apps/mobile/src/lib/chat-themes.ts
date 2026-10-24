import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_CHAT_THEME, chatTheme, isChatThemeId } from "@six/shared";
import { create } from "zustand";

const KEY = "six:chat-theme";

interface ChatThemeState {
  id: string;
  set: (id: string) => void;
}

/** The chat background chosen on this device. */
export const useChatThemeStore = create<ChatThemeState>((set) => ({
  id: DEFAULT_CHAT_THEME,
  set(id) {
    set({ id });
    void AsyncStorage.setItem(KEY, id).catch(() => null);
  },
}));

void AsyncStorage.getItem(KEY)
  .then((id) => id && isChatThemeId(id) && useChatThemeStore.setState({ id }))
  .catch(() => null);

export const useChatTheme = () => chatTheme(useChatThemeStore((s) => s.id));
