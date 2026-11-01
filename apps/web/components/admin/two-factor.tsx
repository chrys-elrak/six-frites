"use client";

import { SixApiError, unwrap } from "@six/sdk";
import type { AdminMeDTO } from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { QrCode } from "@/components/qr-code";
import { PrimaryButton } from "@/components/ui";
import { adminKeys } from "@/lib/admin";
import { six } from "@/lib/six";

/** Asks for an authenticator code before moderation opens, and sets the authenticator up the first time. */
export function TwoFactor({ setup }: { setup: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const secret = useQuery({
    queryKey: ["admin", "2fa-secret"],
    queryFn: async () => unwrap(await six.api.POST("/v1/admin/2fa/secret")),
    enabled: setup,
    staleTime: Infinity,
    retry: false,
  });
  const verify = useMutation({
    mutationFn: async () =>
      unwrap(await six.api.POST("/v1/admin/2fa", { body: { code, secret: setup ? secret.data?.secret : undefined } })),
    onSuccess: (me: AdminMeDTO) => qc.setQueryData(adminKeys.me, me),
    onError: () => setCode(""),
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-4 py-12">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-6 text-brand" />
        <h1 className="text-xl font-semibold tracking-tight">Moderation</h1>
      </div>
      {setup ? (
        <div className="space-y-3 text-sm text-stone-600 dark:text-stone-300">
          <p>
            Moderation shows who sent every anonymous message, so it needs a second step. Scan this with an authenticator app
            (Google Authenticator, Aegis, 1Password…), then enter the code it shows.
          </p>
          {secret.data && (
            <>
              <QrCode value={secret.data.uri} className="mx-auto size-48 rounded-xl" />
              <p className="text-center font-mono text-xs break-all select-all">{secret.data.secret}</p>
            </>
          )}
          {secret.isError && <p className="text-red-600 dark:text-red-400">Couldn't make a secret. Reload to try again.</p>}
        </div>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-300">Enter the code from your authenticator app.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) verify.mutate();
        }}
        className="space-y-3"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="Authenticator code"
          placeholder="123456"
          className="w-full rounded-xl bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] ring-1 ring-stone-200 outline-none focus:ring-brand dark:bg-stone-900 dark:ring-stone-800"
        />
        {verify.isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {verify.error instanceof SixApiError && verify.error.code === "WRONG_2FA_CODE"
              ? "That code didn't work. Wait for the next one and try again."
              : verify.error.message}
          </p>
        )}
        <PrimaryButton type="submit" disabled={code.length !== 6 || verify.isPending || (setup && !secret.data)} className="w-full">
          {verify.isPending ? "Checking…" : "Continue"}
        </PrimaryButton>
      </form>
    </main>
  );
}
