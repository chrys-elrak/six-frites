"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { ASK_COLORS, ASK_MAX } from "@six/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { Avatar } from "@/components/avatar";
import { GoogleButton } from "@/components/google-button";
import { LanguageSelect } from "@/components/language-select";
import { Logo } from "@/components/logo";
import { PrimaryButton } from "@/components/ui";
import { unlock } from "@/lib/app-lock";
import { useT } from "@/lib/i18n";
import { deviceName, useSession } from "@/lib/session";
import { six } from "@/lib/six";

export default function AskPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const tr = useT();
  const status = useSession((s) => s.status);
  const [text, setText] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["ask-profile", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/{code}", { params: { path: { code } } })),
    retry: false,
  });

  const send = useMutation({
    mutationFn: async () =>
      unwrap(await six.api.POST("/v1/ask/{code}", { params: { path: { code } }, body: { text: text.trim() } })),
    onSuccess: () => setText(""),
  });

  async function onCredential(idToken: string) {
    setSignInError(null);
    try {
      unlock();
      await six.auth.loginWithGoogle(idToken, { guest: true, deviceName: deviceName() });
    } catch (err) {
      setSignInError(
        err instanceof SixApiError
          ? ((tr.auth.errors as Record<string, string | undefined>)[err.code] ?? err.message)
          : tr.common.somethingWrong,
      );
    }
  }

  if (profile.isError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        <SearchX className="size-12 text-stone-400" />
        <p className="text-stone-600 dark:text-stone-300">{tr.ask.linkGone}</p>
        <Link href="/inbox" className="font-medium text-brand hover:underline">
          {tr.ask.getYours}
        </Link>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-14 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-2">
        <LanguageSelect />
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        {profile.data ? <Avatar user={profile.data} size="lg" /> : <Logo className="size-20" />}
        <h1 className="text-xl font-semibold tracking-tight">{profile.data && tr.ask.sendTo(profile.data.displayName)}</h1>
      </div>

      {send.isSuccess ? (
        <div className="space-y-3 text-center">
          <p className="rounded-2xl bg-green-50 p-4 font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
            {tr.ask.sent}
          </p>
          <PrimaryButton type="button" onClick={() => send.reset()} className="w-full">
            {tr.ask.sendAnother}
          </PrimaryButton>
        </div>
      ) : status === "authed" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send.mutate();
          }}
          className="space-y-3"
        >
          <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-black/5">
            <p
              className="flex items-center justify-center gap-2 px-4 py-3.5 font-semibold text-white"
              style={{ backgroundImage: `linear-gradient(135deg, ${ASK_COLORS[0][0]}, ${ASK_COLORS[0][1]})` }}
            >
              <Logo className="size-7 shrink-0" />
              {tr.ask.prompt}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={ASK_MAX}
              rows={5}
              autoFocus
              placeholder={tr.ask.placeholder}
              aria-label={tr.ask.placeholder}
              className="block w-full resize-none bg-transparent px-4 pt-3 text-[17px] font-medium text-stone-900 outline-none placeholder:text-stone-400"
            />
            <p className={`px-4 pb-3 text-right text-xs ${text.length >= ASK_MAX ? "text-red-600" : "text-stone-400"}`}>
              {text.length}/{ASK_MAX}
            </p>
          </div>
          {send.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {tr.common.somethingWrongRetry}
            </p>
          )}
          <PrimaryButton type="submit" disabled={!text.trim() || send.isPending} className="w-full">
            {send.isPending ? tr.ask.sending : tr.common.send}
          </PrimaryButton>
        </form>
      ) : status === "anon" ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-stone-500 dark:text-stone-400">{tr.ask.signInToSend}</p>
          <GoogleButton onCredential={onCredential} />
          {signInError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {signInError}
            </p>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-stone-500">{tr.common.loading}</p>
      )}

      <Link href="/inbox" className="text-center text-sm font-medium text-brand hover:underline">
        {tr.ask.getYours}
      </Link>
    </main>
  );
}
