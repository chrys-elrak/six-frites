import type { SecretStore } from "@six/sdk";
import { create } from "zustand";

interface Drafts {
  byChat: Record<string, string>;
  ready: boolean;
  set: (chatId: string, text: string) => void;
}

let store: SecretStore | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Text typed in each chat and not sent yet, kept in the device's sealed store so it survives a restart. */
export const useDrafts = create<Drafts>((set, get) => ({
  byChat: {},
  ready: false,
  set(chatId, text) {
    const { [chatId]: _old, ...rest } = get().byChat;
    set({ byChat: text.trim() ? { ...rest, [chatId]: text } : rest });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void store?.set("drafts", JSON.stringify(get().byChat)).catch(() => null), 500);
  },
}));

/** Loads the signed-in account's drafts; anything typed before they load wins. */
export async function openDrafts(s: SecretStore) {
  store = s;
  const raw = await s.get("drafts").catch(() => null);
  const saved = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  useDrafts.setState((d) => ({ byChat: { ...saved, ...d.byChat }, ready: true }));
}

/** Forgets the drafts in memory when signing out; the sealed store is wiped with the keys. */
export function closeDrafts() {
  store = null;
  if (timer) clearTimeout(timer);
  useDrafts.setState({ byChat: {}, ready: false });
}
