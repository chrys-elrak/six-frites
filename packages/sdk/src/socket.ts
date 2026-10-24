import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@six/shared";
import type { TokenManager } from "./tokens.js";

export type SixSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface RealtimeOptions {
  /** Called after every (re)connect, before live events are trusted. Fetch `/v1/sync` here. */
  onResync?: () => Promise<void> | void;
}

export function createRealtime(baseUrl: string, tokens: TokenManager, opts: RealtimeOptions = {}) {
  const socket: SixSocket = io(baseUrl, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket"],
    auth: (cb) => {
      void tokens.getAccessToken().then((token) => cb({ token }));
    },
  });

  socket.on("connect", () => void opts.onResync?.());

  socket.on("connect_error", async (err) => {
    const code = (err as { data?: { error?: { code?: string } } }).data?.error?.code;
    if (code !== "UNAUTHENTICATED") return;
    const token = await tokens.refresh();
    if (token) socket.connect();
  });

  socket.on("session:revoked", () => {
    socket.disconnect();
    void tokens.clear();
  });

  return socket;
}
