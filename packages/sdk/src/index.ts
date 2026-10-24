import type { AuthResult, GoogleLoginInput, Platform } from "@six/shared";
import { unwrap } from "./errors.js";
import { createRestClient } from "./rest.js";
import { createRealtime, type RealtimeOptions } from "./socket.js";
import { type RefreshTokenStore, TokenManager } from "./tokens.js";

export { SixApiError, unwrap } from "./errors.js";
export type { paths, components } from "./schema.js";
export type { RefreshTokenStore } from "./tokens.js";
export type { CursorStore, Realtime, RealtimeOptions, SixSocket } from "./socket.js";

export interface SixClientOptions {
  baseUrl: string;
  platform: Platform;
  refreshTokenStore?: RefreshTokenStore;
  fetch?: typeof fetch;
}

export function createSixClient(opts: SixClientOptions) {
  const tokens = new TokenManager({
    baseUrl: opts.baseUrl,
    platform: opts.platform,
    store: opts.refreshTokenStore,
    fetch: opts.fetch,
  });
  const api = createRestClient(opts.baseUrl, tokens, opts.fetch);

  const auth = {
    onChange: tokens.onChange.bind(tokens),
    getAccessToken: () => tokens.getAccessToken(),

    async loginWithGoogle(idToken: string, extra: Omit<GoogleLoginInput, "idToken" | "device"> & { deviceName?: string } = {}) {
      const result = unwrap(
        await api.POST("/v1/auth/google", {
          body: {
            idToken,
            inviteCode: extra.inviteCode,
            device: { platform: opts.platform, name: extra.deviceName },
          },
        }),
      ) as AuthResult;
      await tokens.accept(result);
      return result.user;
    },

    /** Restores a session on app start (cookie on web, secure storage on native). */
    async resume() {
      const token = await tokens.refresh();
      if (!token) return null;
      return unwrap(await api.GET("/v1/me"));
    },

    async logout() {
      try {
        await api.POST("/v1/auth/logout");
      } finally {
        await tokens.clear();
      }
    },
  };

  return {
    api,
    auth,
    realtime: (realtimeOpts: RealtimeOptions) => createRealtime(opts.baseUrl, tokens, api, realtimeOpts),
  };
}

export type SixClient = ReturnType<typeof createSixClient>;
