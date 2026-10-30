"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { InviteCard, invitePreviewQuery } from "@/components/invite-card";
import { PrimaryButton } from "@/components/ui";
import { shareInvite } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";

function Shell({ children }: { children: React.ReactNode }) {
  const tr = useT();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-6 px-4 text-center">
      {children}
      <Link href="/" className="text-sm text-stone-500 underline-offset-4 hover:underline">
        {tr.auth.goHome}
      </Link>
    </main>
  );
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const tr = useT();
  const router = useRouter();
  const { status, user } = useSession();
  const preview = useQuery(invitePreviewQuery(code));

  const accept = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code } } })),
    onSuccess: () => user?.guest && window.location.replace("/"),
  });

  useEffect(() => {
    if (status === "anon") router.replace(`/login?invite=${encodeURIComponent(code)}`);
  }, [status, router, code]);

  if (preview.isPending || status !== "authed") {
    return <main className="grid min-h-dvh place-items-center text-sm text-stone-500">{tr.common.loading}</main>;
  }

  if (preview.isError) {
    return (
      <Shell>
        <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
          <SearchX className="size-8" strokeWidth={1.6} />
        </span>
        <h1 className="text-xl font-semibold">{tr.auth.inviteNotFound}</h1>
        <p className="text-sm text-stone-500">{tr.auth.inviteNotFoundHint}</p>
      </Shell>
    );
  }

  const isMine = user?.id === preview.data.inviter.id;

  return (
    <Shell>
      <InviteCard invite={preview.data} />

      {preview.data.status === "valid" && (
        <div className="w-full space-y-3">
          {isMine && (
            <>
              <p className="text-sm text-stone-500">{tr.auth.yourInvite}</p>
              <PrimaryButton className="w-full" onClick={() => void shareInvite(preview.data.code)}>
                {tr.common.shareLink}
              </PrimaryButton>
            </>
          )}

          {!isMine && !accept.isSuccess && (
            <PrimaryButton className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
              {tr.auth.acceptInvite}
            </PrimaryButton>
          )}

          {accept.isSuccess && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {tr.auth.connectedWith(accept.data.referrer.displayName)}
            </p>
          )}

          {accept.isError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {accept.error instanceof SixApiError
                ? ((tr.auth.acceptErrors as Record<string, string | undefined>)[accept.error.code] ??
                  accept.error.message)
                : tr.common.somethingWrong}
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}
