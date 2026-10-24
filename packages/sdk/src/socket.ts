import { io, type Socket } from "socket.io-client";
import type {
  AckResult,
  ChangeEventDTO,
  ChatReadDTO,
  ClientToServerEvents,
  MessageDTO,
  SendMessageInput,
  ServerToClientEvents,
  TypingDTO,
} from "@six/shared";
import { SixApiError, unwrap } from "./errors.js";
import type { RestClient } from "./rest.js";
import type { TokenManager } from "./tokens.js";

export type SixSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Persists the sync cursor so a cold start only fetches what changed (e.g. AsyncStorage on mobile). */
export interface CursorStore {
  get(): Promise<string | null>;
  set(cursor: string): Promise<void>;
}

export interface RealtimeOptions {
  onEvent: (event: ChangeEventDTO) => void;
  /** Ephemeral "is typing" signals from other members; not replayed by sync. */
  onTyping?: (event: TypingDTO) => void;
  /** Called when the server can no longer replay from our cursor; refetch everything. */
  onResyncRequired?: () => void;
  onStatus?: (status: "connecting" | "syncing" | "live" | "offline") => void;
  cursorStore?: CursorStore;
}

function memoryCursor(): CursorStore {
  let value: string | null = null;
  return { get: async () => value, set: async (c) => void (value = c) };
}

/**
 * Keeps a client in sync: on every (re)connect it drains `/v1/sync` from the stored cursor before
 * trusting live events, buffering socket events that arrive meanwhile and dropping any already seen.
 */
export function createRealtime(baseUrl: string, tokens: TokenManager, api: RestClient, opts: RealtimeOptions) {
  const store = opts.cursorStore ?? memoryCursor();
  let cursor: bigint | null = null;
  let syncing = false;
  let buffer: ChangeEventDTO[] = [];

  const socket: SixSocket = io(baseUrl, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket"],
    auth: (cb) => void tokens.getAccessToken().then((token) => cb({ token })),
  });

  const undelivered = new Map<string, string>();
  let deliveryTimer: ReturnType<typeof setTimeout> | null = null;

  function flushDeliveries() {
    deliveryTimer = null;
    for (const [chatId, messageId] of undelivered) {
      undelivered.delete(chatId);
      const ack = socket.connected
        ? socket.timeout(10_000).emitWithAck("chat:delivered", { chatId, messageId })
        : api.POST("/v1/chats/{id}/delivered", { params: { path: { id: chatId } }, body: { messageId } });
      void ack.catch(() => null);
    }
  }

  function apply(event: ChangeEventDTO) {
    const id = BigInt(event.eventId);
    if (cursor !== null && id <= cursor) return;
    cursor = id;
    opts.onEvent(event);
    if (event.type === "message.new" && event.data.senderId !== tokens.userId) {
      undelivered.set(event.data.chatId, event.data.id);
      deliveryTimer ??= setTimeout(flushDeliveries, 300);
    }
  }

  async function saveCursor() {
    if (cursor !== null) await store.set(cursor.toString());
  }

  async function drain() {
    if (cursor === null) {
      const saved = await store.get();
      if (saved) cursor = BigInt(saved);
    }
    for (;;) {
      if (cursor === null) {
        cursor = BigInt(unwrap(await api.GET("/v1/sync")).cursor);
        return;
      }
      try {
        const page = unwrap(
          await api.GET("/v1/sync", { params: { query: { since: cursor.toString(), limit: 500 } } }),
        );
        page.events.forEach(apply);
        cursor = BigInt(page.cursor);
        if (!page.hasMore) return;
      } catch (err) {
        if (!(err instanceof SixApiError) || err.code !== "SYNC_CURSOR_EXPIRED") throw err;
        cursor = null;
        opts.onResyncRequired?.();
      }
    }
  }

  let active = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const sendPresence = () => socket.connected && socket.emit("presence", { active });

  socket.on("connect", async () => {
    sendPresence();
    syncing = true;
    opts.onStatus?.("syncing");
    try {
      await drain();
      buffer.sort((a, b) => (BigInt(a.eventId) < BigInt(b.eventId) ? -1 : 1)).forEach(apply);
      await saveCursor();
      opts.onStatus?.("live");
    } catch {
      socket.disconnect().connect();
    } finally {
      buffer = [];
      syncing = false;
    }
  });

  socket.on("change", (event) => {
    if (syncing) buffer.push(event);
    else {
      apply(event);
      void saveCursor();
    }
  });

  socket.on("typing", (e) => opts.onTyping?.(e));

  socket.on("disconnect", () => opts.onStatus?.("offline"));

  socket.on("connect_error", async (err) => {
    opts.onStatus?.("offline");
    const code = (err as { data?: { error?: { code?: string } } }).data?.error?.code;
    if (code !== "UNAUTHENTICATED") return;
    const token = await tokens.refresh();
    if (token) socket.connect();
  });

  socket.on("session:revoked", () => {
    socket.disconnect();
    void tokens.clear();
  });

  async function acked<T>(pending: Promise<AckResult<T>>): Promise<T> {
    const res = await pending;
    if (!res.ok) throw new SixApiError(0, res.error.code, res.error.message, res.error.details);
    return res.data;
  }

  const typingSentAt = new Map<string, number>();

  return {
    socket,
    /** Call on every keystroke; it throttles itself. Pass false when the draft is sent or cleared. */
    setTyping(chatId: string, typing: boolean) {
      if (!socket.connected) return;
      const last = typingSentAt.get(chatId);
      if (typing) {
        if (last && Date.now() - last < 3000) return;
        typingSentAt.set(chatId, Date.now());
      } else {
        if (!last) return;
        typingSentAt.delete(chatId);
      }
      socket.emit("chat:typing", { chatId, typing });
    },
    start() {
      opts.onStatus?.("connecting");
      socket.connect();
    },
    stop() {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      socket.disconnect();
    },
    /**
     * Tells the server whether the app is open and visible, so push notifications skip this device
     * while it is in use. Call on visibility changes; it keeps itself fresh while active.
     */
    setPresence(next: boolean) {
      active = next;
      sendPresence();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = next ? setInterval(sendPresence, 30_000) : null;
    },
    /** Sends over the socket when live, otherwise over REST. Safe to retry with the same clientId. */
    async sendMessage(chatId: string, input: SendMessageInput): Promise<MessageDTO> {
      if (socket.connected) {
        return acked(socket.timeout(10_000).emitWithAck("message:send", { chatId, ...input }));
      }
      return unwrap(await api.POST("/v1/chats/{id}/messages", { params: { path: { id: chatId } }, body: input }));
    },
    async markRead(chatId: string, messageId?: string): Promise<ChatReadDTO | null> {
      if (socket.connected) return acked(socket.timeout(10_000).emitWithAck("chat:read", { chatId, messageId }));
      return unwrap(await api.POST("/v1/chats/{id}/read", { params: { path: { id: chatId } }, body: { messageId } }));
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
