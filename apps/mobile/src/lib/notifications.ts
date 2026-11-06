import { unwrap } from "@six/sdk";
import type { NotificationsDTO } from "@six/shared";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { six } from "./six";

export const notificationsKey = ["notifications"] as const;

export function useNotifications() {
  return useQuery({ queryKey: notificationsKey, queryFn: async () => unwrap(await six.api.GET("/v1/notifications")) });
}

/** Clears the tab's badge; the rows keep their unread look until the next fetch. */
export async function markNotificationsSeen(qc: QueryClient) {
  qc.setQueryData<NotificationsDTO>(notificationsKey, (d) => d && { ...d, unread: 0 });
  await six.api.POST("/v1/notifications/seen").catch(() => null);
}
