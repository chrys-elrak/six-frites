import { unwrap } from "@six/sdk";
import { getLocale } from "./i18n";
import { six } from "./six";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return reg ? reg.pushManager.getSubscription() : null;
}

async function saveSubscription(sub: PushSubscription) {
  unwrap(
    await six.api.POST("/v1/devices/push-token", {
      body: { provider: "webpush", token: JSON.stringify(sub), locale: getLocale() },
    }),
  );
}

/** Subscribes this browser to push notifications for the signed-in session. */
export async function enablePush(): Promise<"on" | "denied" | "unavailable"> {
  if (!pushSupported()) return "unavailable";
  const config = unwrap(await six.api.GET("/v1/push/config"));
  if (!config.webPushPublicKey) return "unavailable";
  if ((await Notification.requestPermission()) !== "granted") return "denied";

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(config.webPushPublicKey),
    }));
  await saveSubscription(sub);
  return "on";
}

export async function disablePush() {
  const sub = await currentSubscription();
  await sub?.unsubscribe();
  await six.api.DELETE("/v1/devices/push-token", { params: { query: { provider: "webpush" } } }).catch(() => null);
}

/**
 * Re-links an existing browser subscription after signing in again, since tokens belong to a
 * session, or after changing language so notifications follow it.
 */
export async function relinkPush() {
  const sub = await currentSubscription();
  if (sub && Notification.permission === "granted") await saveSubscription(sub);
  return !!sub;
}
