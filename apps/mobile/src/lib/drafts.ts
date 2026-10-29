import type { SecretStore } from "@six/sdk";
import { create } from "zustand";

type ByChat = Record<string, string>;

interface Drafts {
  byChat: ByChat;
  parked: ByChat;
  ready: boolean;
  set: (chatId: string, text: string) => void;
  park: (chatId: string, text: string) => void;
}

let store: SecretStore | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const put = (map: ByChat, chatId: string, text: string) => {
  const { [chatId]: _old, ...rest } = map;
  return text.trim() ? { ...rest, [chatId]: text } : rest;
};

function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const { byChat, parked } = useDrafts.getState();
    void store?.set("drafts", JSON.stringify(byChat)).catch(() => null);
    void store?.set("parked", JSON.stringify(parked)).catch(() => null);
  }, 500);
}

/** Text typed in each chat and not sent yet, kept in the device's sealed store so it survives a restart. */
export const useDrafts = create<Drafts>((set, get) => ({
  byChat: {},
  parked: {},
  ready: false,
  set(chatId, text) {
    set({ byChat: put(get().byChat, chatId, text) });
    save();
  },
  park(chatId, text) {
    set({ parked: put(get().parked, chatId, text) });
    save();
  },
}));

/** Loads the signed-in account's drafts; anything typed before they load wins. */
export async function openDrafts(s: SecretStore) {
  store = s;
  const [drafts, parked] = await Promise.all([s.get("drafts"), s.get("parked")].map((p) => p.catch(() => null)));
  const saved = (raw?: string | null) => (raw ? (JSON.parse(raw) as ByChat) : {});
  useDrafts.setState((d) => ({
    byChat: { ...saved(drafts), ...d.byChat },
    parked: { ...saved(parked), ...d.parked },
    ready: true,
  }));
}

/** Forgets the drafts in memory when signing out; the sealed store is wiped with the keys. */
export function closeDrafts() {
  store = null;
  if (timer) clearTimeout(timer);
  useDrafts.setState({ byChat: {}, parked: {}, ready: false });
}
