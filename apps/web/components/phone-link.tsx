"use client";

import { b64, generateLinkKey } from "@six/crypto";
import { SixApiError, unwrap } from "@six/sdk";
import type { LinkClaim, LinkTicket } from "@six/shared";
import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { startE2EE } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { deviceId, deviceName } from "@/lib/session";
import { six } from "@/lib/six";
import { QrCode } from "./qr-code";

type Linked = Extract<LinkClaim, { status: "linked" }>;

/**
 * Signs this computer in from a phone that's already signed in: shows a QR code carrying a one-time ticket and
 * key, checks every two seconds until the phone approves, and brings a new code when one expires. The phone seals
 * the backup key to that key, so past messages open here without the PIN.
 */
export function PhoneLink({ onLinked }: { onLinked: () => void }) {
  const tr = useT();
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function adopt(claim: Linked, key: ReturnType<typeof generateLinkKey>) {
      if (claim.sealedKey) {
        await startE2EE(claim.user.id)
          .adoptLinkedBackupKey(key, claim.sealedKey, claim.user.backupKeyId)
          .catch(() => null);
      }
      onLinked();
    }

    async function run() {
      while (!stopped) {
        const key = generateLinkKey();
        let ticket: LinkTicket;
        try {
          ticket = unwrap(
            await six.api.POST("/v1/auth/link", { body: { device: { platform: "web", name: deviceName(), id: deviceId() } } }),
          );
        } catch {
          await wait(5000);
          continue;
        }
        if (stopped) return;
        setCode(`six-link:${ticket.id}:${ticket.secret}:${b64(key.pub)}`);
        while (!stopped && Date.parse(ticket.expiresAt) > Date.now()) {
          await wait(2000);
          if (stopped) return;
          try {
            const claim = await six.auth.claimLink(ticket.id, ticket.secret);
            if (claim.status === "linked") return void (await adopt(claim, key));
          } catch (err) {
            if (err instanceof SixApiError && err.code === "LINK_NOT_FOUND") break;
          }
        }
      }
    }

    void run();
    return () => {
      stopped = true;
    };
  }, [onLinked]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 p-4 text-center dark:border-stone-800">
      <p className="flex items-center gap-2 font-medium">
        <Smartphone className="size-4" />
        {tr.auth.linkWithPhone}
      </p>
      <div className="size-48 overflow-hidden rounded-xl bg-white">
        {code ? <QrCode value={code} className="size-full" /> : <div className="size-full animate-pulse bg-stone-200" />}
      </div>
      <p className="text-sm text-stone-500 dark:text-stone-400">{tr.auth.linkSteps}</p>
    </div>
  );
}
