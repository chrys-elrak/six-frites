"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/ui";
import { shareInvite } from "@/lib/format";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";

const acceptErrors: Record<string, string> = {
  ALREADY_REFERRED: "You've already joined through an invite.",
  INVITE_OWN: "This is your own invite.",
  INVITE_EXPIRED: "This invite has expired.",
  INVITE_EXHAUSTED: "This invite has already been used up.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-6 px-4 text-center">
      {children}
      <Link href="/" className="text-sm text-stone-500 underline-offset-4 hover:underline">
        Go to Six Frites
      </Link>
    </main>
  );
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
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
    return <main className="grid min-h-dvh place-items-center text-sm text-stone-500">Loading…</main>;
  }

  if (preview.isError) {
    return (
      <Shell>
        <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
          <SearchX className="size-8" strokeWidth={1.6} />
        </span>
        <h1 className="text-xl font-semibold">This invite doesn't exist</h1>
        <p className="text-sm text-stone-500">Check the link, or ask your friend for a new one.</p>
      </Shell>
    );
  }

  const { inviter, status: inviteStatus } = preview.data;
  const isMine = user?.id === inviter.id;

  return (
    <Shell>
      <Avatar user={inviter} size="lg" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{inviter.displayName} invited you to Six Frites</h1>
        {inviteStatus !== "valid" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {inviteStatus === "expired" ? "This invite has expired." : "This invite has already been used up."}
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
              Sign in to accept
            </Link>
          )}

          {status === "authed" && isMine && (
            <>
              <p className="text-sm text-stone-500">This is your invite link. Share it with a friend.</p>
              <PrimaryButton className="w-full" onClick={() => void shareInvite(preview.data.code)}>
                Share link
              </PrimaryButton>
            </>
          )}

          {status === "authed" && !isMine && !accept.isSuccess && (
            <PrimaryButton className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
              Accept invite
            </PrimaryButton>
          )}

          {accept.isSuccess && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              You're connected with {accept.data.referrer.displayName}.
            </p>
          )}

          {accept.isError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {accept.error instanceof SixApiError
                ? (acceptErrors[accept.error.code] ?? accept.error.message)
                : "Something went wrong."}
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}
