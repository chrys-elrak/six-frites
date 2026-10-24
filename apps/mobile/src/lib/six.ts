import { createSixClient, type RefreshTokenStore } from "@six/sdk";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000";

const REFRESH_KEY = "six.refreshToken";

const refreshTokenStore: RefreshTokenStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: (token) => (token ? SecureStore.setItemAsync(REFRESH_KEY, token) : SecureStore.deleteItemAsync(REFRESH_KEY)),
};

export const six = createSixClient({
  baseUrl: API_URL,
  platform: Platform.OS === "ios" ? "ios" : "android",
  refreshTokenStore,
});
