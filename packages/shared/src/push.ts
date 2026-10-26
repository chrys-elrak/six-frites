import { z } from "zod";
import { LOCALES } from "./i18n/index.js";

export const PushProvider = z.enum(["webpush", "fcm", "apns"]);
export type PushProvider = z.infer<typeof PushProvider>;

export const RegisterPushTokenInput = z.object({
  provider: PushProvider,
  token: z
    .string()
    .min(1)
    .max(4000)
    .describe("webpush: the JSON PushSubscription; fcm/apns: the device token"),
  locale: z.enum(LOCALES).optional().describe("Language for this device's notifications; English when left out"),
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
