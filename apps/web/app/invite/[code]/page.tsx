"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Avatar } from "@/components/avatar";
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
  const { status, user } = useSession();

  const preview = useQuery({
    queryKey: ["invite", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/invites/{code}", { params: { path: { code } } })),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code } } })),
  });

  if (preview.isPending || status === "loading") {
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

  const { inviter, status: inviteStatus } = preview.data;
  const isMine = user?.id === inviter.id;

  return (
    <Shell>
      <Avatar user={inviter} size="lg" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{tr.auth.invitedYou(inviter.displayName)}</h1>
        {inviteStatus !== "valid" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {inviteStatus === "expired" ? tr.auth.inviteExpired : tr.auth.inviteUsedUp}
          </p>
        )}
      </div>

      {inviteStatus === "valid" && (
        <div className="w-full space-y-3">
          {status === "anon" && (
            <Link
              href={`/login?invite=${encodeURIComponent(preview.data.code)}`}
              className="block w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
            >
              {tr.auth.signInToAccept}
            </Link>
          )}

          {status === "authed" && isMine && (
            <>
              <p className="text-sm text-stone-500">{tr.auth.yourInvite}</p>
              <PrimaryButton className="w-full" onClick={() => void shareInvite(preview.data.code)}>
                {tr.common.shareLink}
              </PrimaryButton>
            </>
          )}

          {status === "authed" && !isMine && !accept.isSuccess && (
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
