import { unwrap } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { six } from "./six";

export const androidAppKey = ["app", "android"] as const;

/**
 * Where the web sends people to get the Android app. Updates in the app and their push still go to Koera Store:
 * Play signs with its own key, so it can't update an app installed from there.
 */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.sixfrites.app";

/** The newest published Android app, or null when there isn't one yet. */
export function useAndroidApp() {
  return useQuery({
    queryKey: androidAppKey,
    queryFn: async () => unwrap(await six.api.GET("/v1/app/android")),
    staleTime: 10 * 60 * 1000,
  });
}
