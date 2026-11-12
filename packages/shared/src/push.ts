import { z } from "zod";
import { LOCALES } from "./i18n/index.js";
import { TONES } from "./tones.js";

/** `fcmPlay` is FCM from a Google Play install, which updates through Play and so never gets our new-version push. */
export const PushProvider = z.enum(["webpush", "fcm", "fcmPlay", "apns"]);
export type PushProvider = z.infer<typeof PushProvider>;

export const RegisterPushTokenInput = z.object({
  provider: PushProvider,
  token: z
    .string()
    .min(1)
    .max(4000)
    .describe("webpush: the JSON PushSubscription; fcm/apns: the device token"),
  locale: z.enum(LOCALES).optional().describe("Language for this device's notifications; English when left out"),
  tone: z.enum(TONES).optional().describe("fcm/apns: the message tone picked in the app, played by the phone itself; the phone's own sound when left out"),
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenInput>;

export const RemovePushTokenQuery = z.object({ provider: PushProvider });

export const PushConfigDTO = z.object({
  webPushPublicKey: z.string().nullable().describe("VAPID key for PushManager.subscribe, or null if Web Push is off"),
});
export type PushConfigDTO = z.infer<typeof PushConfigDTO>;

/** What a push notification carries; clients show title/body and open the chat, or `url` when there is none, when tapped. */
export interface PushPayload {
  title: string;
  body: string;
  icon: string | null;
  chatId: string | null;
  messageId: string | null;
  url: string;
}
