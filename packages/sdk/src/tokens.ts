import type { AuthResult, Platform } from "@six/shared";

/** Persists the refresh token on native clients (e.g. expo-secure-store). Web relies on the httpOnly cookie instead. */
export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export type AuthListener = (auth: AuthResult | null) => void;

export interface TokenManagerOptions {
  baseUrl: string;
  platform: Platform;
  store?: RefreshTokenStore;
  fetch?: typeof fetch;
}

/**
 * Holds the access token in memory and refreshes it on demand. Concurrent callers share a single
 * in-flight refresh so a burst of 401s never rotates the refresh token twice (which would trip reuse detection).
 */
export class TokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string | null> | null = null;
  private listeners = new Set<AuthListener>();

  constructor(private readonly opts: TokenManagerOptions) {}

  get isWeb() {
    return this.opts.platform === "web";
  }

  onChange(fn: AuthListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async accept(auth: AuthResult) {
    this.accessToken = auth.accessToken;
    this.expiresAt = Date.parse(auth.accessTokenExpiresAt);
    if (!this.isWeb && auth.refreshToken) await this.opts.store?.set(auth.refreshToken);
    this.listeners.forEach((fn) => fn(auth));
  }

  async clear() {
    this.accessToken = null;
    this.expiresAt = 0;
    if (!this.isWeb) await this.opts.store?.set(null);
    this.listeners.forEach((fn) => fn(null));
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return this.accessToken;
    return this.refresh();
  }

  refresh(): Promise<string | null> {
    this.inflight ??= this.doRefresh().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = this.isWeb ? undefined : await this.opts.store?.get();
    if (!this.isWeb && !refreshToken) return null;

    const res = await (this.opts.fetch ?? fetch)(`${this.opts.baseUrl}/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: refreshToken ? { "content-type": "application/json" } : undefined,
      body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
    });

    if (!res.ok) {
      await this.clear();
      return null;
    }
    const auth = (await res.json()) as AuthResult;
    await this.accept(auth);
    return auth.accessToken;
  }
}
