import { unwrap } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { six } from "./six";

export const androidAppKey = ["app", "android"] as const;

/** The newest published Android app, or null when there isn't one yet. */
export function useAndroidApp() {
  return useQuery({
    queryKey: androidAppKey,
    queryFn: async () => unwrap(await six.api.GET("/v1/app/android")),
    staleTime: 10 * 60 * 1000,
  });
}
