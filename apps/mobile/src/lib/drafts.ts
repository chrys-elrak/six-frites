import type { E2EE, SecretStore } from "@six/sdk";
import type { ChatDTO } from "@six/shared";
import { create } from "zustand";
import { six } from "./six";

type ByChat = Record<string, string>;

interface Drafts {
  byChat: ByChat;
  parked: ByChat;
  ready: boolean;
  set: (chatId: string, text: string) => void;
  park: (chatId: string, text: string) => void;
}

type Timer = ReturnType<typeof setTimeout>;

let store: SecretStore | null = null;
let client: E2EE | null = null;
let timer: Timer | null = null;
const uploads = new Map<string, Timer>();
/** Per chat, the draft the server holds as far as this device knows. */
const synced = new Map<string, { at: string; text: string }>();
/** Chats known not to be end-to-end encrypted, whose drafts may travel as plain text. */
const plainChats = new Set<string>();

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

/** Sends this chat's draft to my other devices a moment after typing stops. */
function share(chatId: string, text: string) {
  const pending = uploads.get(chatId);
  if (pending) clearTimeout(pending);
  const t: Timer = setTimeout(() => void upload(chatId, text, t), 1500);
  uploads.set(chatId, t);
}

/**
 * Saves the draft on the server: sealed with the backup key when this device has it, as plain text in a
 * chat that isn't encrypted, and not at all otherwise, so an encrypted chat's draft never leaves in clear.
 */
async function upload(chatId: string, text: string, t: Timer) {
  try {
    if ((synced.get(chatId)?.text ?? "") === text) return;
    const sealed = text.trim() ? await client?.sealDraft(chatId, text).catch(() => null) : null;
    const draft = !text.trim() ? null : sealed ? { sealed } : plainChats.has(chatId) ? { text } : undefined;
    if (draft === undefined) return;
    const params = { path: { id: chatId } };
    const { data } = await six.api.PATCH("/v1/chats/{id}", { params, body: { draft } }).catch(() => ({ data: undefined }));
    if (data?.draft) synced.set(chatId, { at: data.draft.at, text });
  } finally {
    if (uploads.get(chatId) === t) uploads.delete(chatId);
  }
}

/** Text typed in each chat and not sent yet, kept in the device's sealed store and shared with my other devices. */
export const useDrafts = create<Drafts>((set, get) => ({
  byChat: {},
  parked: {},
  ready: false,
  set(chatId, text) {
    set({ byChat: put(get().byChat, chatId, text) });
    save();
    share(chatId, text);
  },
  park(chatId, text) {
    set({ parked: put(get().parked, chatId, text) });
    save();
  },
}));

/**
 * Takes in what my other devices saved as this chat's draft, unless this device already has it or still has
 * typing of its own to send. Also notes whether the chat is encrypted, which decides how its drafts travel.
 */
export async function receiveDraft(chat: ChatDTO) {
  if (chat.encrypted) plainChats.delete(chat.id);
  else plainChats.add(chat.id);
  const d = chat.draft;
  const newer = () => !!d && d.at > (synced.get(chat.id)?.at ?? "") && !uploads.has(chat.id);
  if (!d || !newer()) return;
  const text = d.sealed ? await client?.openDraft(chat.id, d.sealed).catch(() => null) : (d.text ?? "");
  if (text == null || !newer()) return;
  synced.set(chat.id, { at: d.at, text });
  useDrafts.setState((s) => ({ byChat: put(s.byChat, chat.id, text) }));
  save();
}

/** Loads the signed-in account's drafts; anything typed before they load wins. */
export async function openDrafts(s: SecretStore, e2ee: E2EE) {
  store = s;
  client = e2ee;
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
  client = null;
  if (timer) clearTimeout(timer);
  for (const t of uploads.values()) clearTimeout(t);
  uploads.clear();
  synced.clear();
  plainChats.clear();
  useDrafts.setState({ byChat: {}, parked: {}, ready: false });
}
