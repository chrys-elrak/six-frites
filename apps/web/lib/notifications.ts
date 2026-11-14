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

/** Marks one notification unread again, or read, here at once and then on the server. */
export async function markNotification(qc: QueryClient, id: string, unread: boolean) {
  qc.setQueryData<NotificationsDTO>(notificationsKey, (d) => d && { ...d, items: d.items.map((n) => (n.id === id ? { ...n, unread } : n)) });
  await six.api.PATCH("/v1/notifications/{id}", { params: { path: { id } }, body: { unread } }).catch(() => null);
}

export async function deleteNotification(qc: QueryClient, id: string) {
  qc.setQueryData<NotificationsDTO>(notificationsKey, (d) => d && { ...d, items: d.items.filter((n) => n.id !== id) });
  await six.api.DELETE("/v1/notifications/{id}", { params: { path: { id } } }).catch(() => null);
}

/** Marks every notification read, here at once and then on the server. */
export async function markAllNotificationsRead(qc: QueryClient) {
  qc.setQueryData<NotificationsDTO>(notificationsKey, (d) => d && { unread: 0, items: d.items.map((n) => ({ ...n, unread: false })) });
  await six.api.POST("/v1/notifications/read").catch(() => null);
}

export async function clearNotifications(qc: QueryClient) {
  qc.setQueryData<NotificationsDTO>(notificationsKey, (d) => d && { unread: 0, items: [] });
  await six.api.DELETE("/v1/notifications").catch(() => null);
}
