"use client";

import { unwrap } from "@six/sdk";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { PrimaryButton } from "./ui";

const LEGAL_PAGES = new Set(["/terms", "/privacy", "/about", "/delete-account"]);

/** Asks someone who just joined to accept the terms before anything else, while the legal pages stay readable. */
export function TermsGate() {
  const tr = useT();
  const pathname = usePathname();
  const user = useSession((s) => (s.status === "authed" ? s.user : null));
  const setUser = useSession((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!user || user.termsAccepted || LEGAL_PAGES.has(pathname)) return null;

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      setUser(unwrap(await six.api.POST("/v1/me/terms")));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={() => {}}>
      <div className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{tr.legal.welcomeTitle}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">{tr.legal.welcomeBody}</p>
        <div className="flex flex-col items-start gap-1 text-sm font-semibold text-brand">
          <a href="/terms" target="_blank" rel="noopener" className="hover:underline">
            {tr.legal.terms}
          </a>
          <a href="/privacy" target="_blank" rel="noopener" className="hover:underline">
            {tr.legal.privacy}
          </a>
        </div>
        {failed && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {tr.common.somethingWrongRetry}
          </p>
        )}
        <PrimaryButton type="button" onClick={() => void accept()} disabled={busy} className="w-full">
          {tr.legal.accept}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => void six.auth.logout()}
          className="w-full text-center text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
        >
          {tr.legal.decline}
        </button>
      </div>
    </Dialog>
  );
}
