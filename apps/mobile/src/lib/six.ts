import { SixApiError, createSixClient, type RefreshTokenStore } from "@six/sdk";
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000";

const REFRESH_KEY = "six.refreshToken";

const refreshTokenStore: RefreshTokenStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: (token) => (token ? SecureStore.setItemAsync(REFRESH_KEY, token) : SecureStore.deleteItemAsync(REFRESH_KEY)),
};

/** Set when an upload is refused because the account's storage is full, so the app can say what to do. */
export const useStorageFull = create<{ open: boolean }>(() => ({ open: false }));

const client = createSixClient({
  baseUrl: API_URL,
  platform: Platform.OS === "ios" ? "ios" : "android",
  refreshTokenStore,
});

export const six = {
  ...client,
  upload: (...args: Parameters<typeof client.upload>) =>
    client.upload(...args).catch((err: unknown) => {
      if (err instanceof SixApiError && err.code === "STORAGE_FULL") useStorageFull.setState({ open: true });
      throw err;
    }),
};
