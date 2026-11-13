import type { PushPayload, PushProvider as ProviderName } from "@six/shared";
import { createSign } from "node:crypto";
import { type ClientHttp2Session, connect } from "node:http2";
import { GoogleAuth } from "google-auth-library";
import webpush from "web-push";
import { env } from "../env.js";

export type SendResult = "sent" | "gone";

/** One way of delivering push notifications (Web Push, FCM, APNs). */
export interface PushProvider {
  /** `tone` is the message tone the device picked, for providers whose notifications the phone itself rings. */
  send(token: string, payload: PushPayload, tone?: string | null): Promise<SendResult>;
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
 * the tag, so a newer message replaces that chat's notification instead of piling up. Android rings whatever sound
 * the channel has, and a channel's sound can't change, so each tone has its own `messages-<tone>` channel.
 */
export class FcmProvider implements PushProvider {
  private readonly auth: GoogleAuth;
  private readonly url: string;

  constructor(serviceAccount: { project_id: string; client_email: string; private_key: string }) {
    this.auth = new GoogleAuth({ credentials: serviceAccount, scopes: "https://www.googleapis.com/auth/firebase.messaging" });
    this.url = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
  }

  async send(token: string, payload: PushPayload, tone?: string | null): Promise<SendResult> {
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
            channelId: tone ? `messages-${tone}` : "messages",
            tag: payload.chatId ?? "app",
          },
        },
      }),
    });
    if (res.status === 404) return "gone";
    if (!res.ok) throw new Error(`FCM answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return "sent";
  }
}

/**
 * Apple Push Notification service for the iOS app, signed with a token-based .p8 key. The data rides under `body`,
 * where expo-notifications reads it, and the chat id is the collapse id, so a newer message replaces that chat's
 * notification. The tone plays from the app bundle, where the expo-notifications plugin copied the .wav files.
 */
export class ApnsProvider implements PushProvider {
  private session: ClientHttp2Session | null = null;
  private jwt: { token: string; at: number } | null = null;

  constructor(
    private readonly key: string,
    private readonly keyId: string,
    private readonly teamId: string,
    private readonly topic: string,
  ) {}

  private bearer() {
    if (this.jwt && Date.now() - this.jwt.at < 50 * 60_000) return this.jwt.token;
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "ES256", kid: this.keyId })}.${b64({ iss: this.teamId, iat: Math.floor(Date.now() / 1000) })}`;
    const signature = createSign("SHA256").update(unsigned).sign({ key: this.key, dsaEncoding: "ieee-p1363" }, "base64url");
    this.jwt = { token: `${unsigned}.${signature}`, at: Date.now() };
    return this.jwt.token;
  }

  private connection() {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = connect("https://api.push.apple.com");
    session.on("error", () => session.destroy());
    session.on("goaway", () => session.close());
    this.session = session;
    return session;
  }

  send(token: string, payload: PushPayload, tone?: string | null): Promise<SendResult> {
    const body = JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: tone ? `${tone}.wav` : "default", "thread-id": payload.chatId ?? "app" },
      body: { chatId: payload.chatId, messageId: payload.messageId, url: payload.url },
    });
    return new Promise((resolve, reject) => {
      const req = this.connection().request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${this.bearer()}`,
        "apns-topic": this.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
        ...(payload.chatId && { "apns-collapse-id": payload.chatId }),
      });
      let status = 0;
      let text = "";
      req.setEncoding("utf8");
      req.on("response", (headers) => (status = Number(headers[":status"])));
      req.on("data", (chunk: string) => (text += chunk));
      req.on("error", reject);
      req.on("end", () => {
        if (status === 200) return resolve("sent");
        if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text)) return resolve("gone");
        reject(new Error(`APNs answered ${status}: ${text.slice(0, 200)}`));
      });
      req.end(body);
    });
  }
}

let providers: Partial<Record<ProviderName, PushProvider>> | null = null;

export function pushProviders() {
  if (providers) return providers;
  const fcm = env.FCM_SERVICE_ACCOUNT ? new FcmProvider(JSON.parse(env.FCM_SERVICE_ACCOUNT)) : null;
  providers = {
    ...(env.WEB_PUSH_PUBLIC_KEY &&
      env.WEB_PUSH_PRIVATE_KEY && {
        webpush: new WebPushProvider(env.WEB_PUSH_PUBLIC_KEY, env.WEB_PUSH_PRIVATE_KEY, env.WEB_PUSH_SUBJECT),
      }),
    ...(fcm && { fcm, fcmPlay: fcm }),
    ...(env.APNS_KEY &&
      env.APNS_KEY_ID && {
        apns: new ApnsProvider(env.APNS_KEY.replace(/\\n/g, "\n"), env.APNS_KEY_ID, env.APNS_TEAM_ID, env.APNS_TOPIC),
      }),
  };
  return providers;
}

/** Swaps the providers, for tests. */
export function setPushProviders(next: Partial<Record<ProviderName, PushProvider>>) {
  providers = next;
}
