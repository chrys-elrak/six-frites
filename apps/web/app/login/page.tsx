"use client";

import { SixApiError } from "@six/sdk";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { GoogleButton } from "@/components/google-button";
import { Logo } from "@/components/logo";
import { deviceName, useSession } from "@/lib/session";
import { AndroidDownload } from "@/components/android-download";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";

function LoginForm() {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();
  const inviteCode = params.get("invite") ?? undefined;
  const next = params.get("next");
  const home = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const status = useSession((s) => s.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signingIn = useRef(false);

  useEffect(() => {
    if (status !== "authed" || signingIn.current) return;
    router.replace(inviteCode ? `/invite/${encodeURIComponent(inviteCode)}` : home);
  }, [status, router, inviteCode, home]);

  async function onCredential(idToken: string) {
    signingIn.current = true;
    setBusy(true);
    setError(null);
    try {
      await six.auth.loginWithGoogle(idToken, { inviteCode, deviceName: deviceName() });
      if (inviteCode) {
        await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code: inviteCode } } }).catch(() => null);
      }
      router.replace(home);
    } catch (err) {
      signingIn.current = false;
      setError(
        err instanceof SixApiError
          ? ((tr.auth.errors as Record<string, string | undefined>)[err.code] ?? err.message)
          : tr.common.somethingWrong,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="space-y-3 text-center">
        <Logo className="mx-auto size-20 drop-shadow-sm" />
        <h1 className="text-2xl font-semibold tracking-tight">Six Frites</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {inviteCode
            ? tr.auth.invitedSignIn
            : next?.startsWith("/add/")
              ? tr.auth.signInToAdd
              : tr.auth.signInToContinue}
        </p>
      </div>

      <div className="space-y-3">
        <GoogleButton onCredential={onCredential} />
        {busy && <p className="text-center text-sm text-stone-500">{tr.auth.signingIn}</p>}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      <AndroidDownload compact />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
