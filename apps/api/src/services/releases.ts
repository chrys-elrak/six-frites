import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, type LatestAppDTO } from "@six/shared";
import { z } from "zod";
import { env } from "../env.js";
import { postReleaseNotes } from "./bot.js";
import { deliverReleasePush } from "./push.js";

const STORE_APP = "six-frites";

export const storePage = `${env.STORE_URL}/${STORE_APP}`;

const StoreRelease = z.object({
  app: z.string(),
  version: z.string(),
  notes: z.string(),
  size: z.number().int(),
  publishedAt: z.string(),
});

/** The newest Android app published on Koera Store, or null while there is none. */
export async function latestRelease(): Promise<LatestAppDTO | null> {
  const res = await fetch(`${env.STORE_URL}/api/apps/${STORE_APP}/latest`, { signal: AbortSignal.timeout(5000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Koera Store answered ${res.status}`);
  const release = StoreRelease.parse(await res.json());
  return {
    version: release.version,
    notes: release.notes || null,
    size: release.size,
    publishedAt: release.publishedAt,
    downloadUrl: storePage,
  };
}

/**
 * Koera Store calls this the first time a version goes live, signing the raw body with the app's webhook secret.
 * Once the signature checks out, every Android phone hears about the new version in the background, and Six Frites
 * News posts its notes in every member's chat with it.
 */
export function announceRelease(body: string, signature: string | undefined) {
  if (!env.STORE_WEBHOOK_SECRET) throw new AppError("FORBIDDEN", "STORE_WEBHOOK_SECRET is not set");
  const expected = Buffer.from(`sha256=${createHmac("sha256", env.STORE_WEBHOOK_SECRET).update(body).digest("hex")}`);
  const given = Buffer.from(signature ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppError("FORBIDDEN", "The signature doesn't match");
  }
  const release = StoreRelease.parse(JSON.parse(body));
  if (release.app !== STORE_APP) return;
  void deliverReleasePush(release.version, storePage).catch(() => null);
  void postReleaseNotes(release.version, release.notes).catch((err: Error) => console.error("release notes not posted:", err.message));
}
