import type { PushPayload, PushProvider as ProviderName } from "@six/shared";
import webpush from "web-push";
import { env } from "../env.js";

export type SendResult = "sent" | "gone";

/** One way of delivering push notifications (Web Push now; FCM and APNs plug in the same way). */
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

let providers: Partial<Record<ProviderName, PushProvider>> | null = null;

export function pushProviders() {
  providers ??= {
    ...(env.WEB_PUSH_PUBLIC_KEY &&
      env.WEB_PUSH_PRIVATE_KEY && {
        webpush: new WebPushProvider(env.WEB_PUSH_PUBLIC_KEY, env.WEB_PUSH_PRIVATE_KEY, env.WEB_PUSH_SUBJECT),
      }),
  };
  return providers;
}

/** Swaps the providers, for tests. */
export function setPushProviders(next: Partial<Record<ProviderName, PushProvider>>) {
  providers = next;
}
