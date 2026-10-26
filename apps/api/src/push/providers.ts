import type { PushPayload, PushProvider as ProviderName } from "@six/shared";
import { GoogleAuth } from "google-auth-library";
import webpush from "web-push";
import { env } from "../env.js";

export type SendResult = "sent" | "gone";

/** One way of delivering push notifications (Web Push and FCM now; APNs plugs in the same way). */
export interface PushProvider {
  send(token: string, payload: PushPayload): Promise<SendResult>;
}

export class WebPushProvider implements PushProvider {
  constructor(
    private readonly publicKey: string,
    private readonly privateKey: string,
    private readonly subject: string,
  ) {}

  async send(token: string, payload: PushPayload): Promise<SendResult> {
    const req = webpush.generateRequestDetails(JSON.parse(token), JSON.stringify(payload), {
      TTL: 24 * 60 * 60,
      urgency: "high",
      vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey },
    });
    const res = await fetch(req.endpoint, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.body ? new Uint8Array(req.body) : undefined,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (!res.ok) throw new Error(`Push service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return "sent";
  }
}

/**
 * Firebase Cloud Messaging for the Android app. Sends data-only messages in the shape expo-notifications
 * presents itself (title, message, JSON body), so a tap hands the app the chat to open. The chat id is
 * the tag, so a newer message replaces that chat's notification instead of piling up.
 */
export class FcmProvider implements PushProvider {
  private readonly auth: GoogleAuth;
  private readonly url: string;

  constructor(serviceAccount: { project_id: string; client_email: string; private_key: string }) {
    this.auth = new GoogleAuth({ credentials: serviceAccount, scopes: "https://www.googleapis.com/auth/firebase.messaging" });
    this.url = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
  }

  async send(token: string, payload: PushPayload): Promise<SendResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.auth.getAccessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          android: { priority: "HIGH", ttl: `${24 * 60 * 60}s` },
          data: {
            title: payload.title,
            message: payload.body,
            body: JSON.stringify({ chatId: payload.chatId, messageId: payload.messageId, url: payload.url }),
            channelId: "messages",
            tag: payload.chatId,
          },
        },
      }),
    });
    if (res.status === 404) return "gone";
    if (!res.ok) throw new Error(`FCM answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return "sent";
  }
}

let providers: Partial<Record<ProviderName, PushProvider>> | null = null;

export function pushProviders() {
  providers ??= {
    ...(env.WEB_PUSH_PUBLIC_KEY &&
      env.WEB_PUSH_PRIVATE_KEY && {
        webpush: new WebPushProvider(env.WEB_PUSH_PUBLIC_KEY, env.WEB_PUSH_PRIVATE_KEY, env.WEB_PUSH_SUBJECT),
      }),
    ...(env.FCM_SERVICE_ACCOUNT && { fcm: new FcmProvider(JSON.parse(env.FCM_SERVICE_ACCOUNT)) }),
  };
  return providers;
}

/** Swaps the providers, for tests. */
export function setPushProviders(next: Partial<Record<ProviderName, PushProvider>>) {
  providers = next;
}
