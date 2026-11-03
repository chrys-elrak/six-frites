"use client";

import { Gamepad2, Images, Lock, Phone, Timer, VenetianMask } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { AndroidDownload } from "@/components/android-download";
import { LanguageSelect } from "@/components/language-select";
import { LegalLinks } from "@/components/legal-page";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { about } from "@/lib/legal";
import { useSession } from "@/lib/session";
import { SIGNED_IN_COOKIE } from "@/lib/site";

const featureIcons = [Lock, Phone, Images, Gamepad2, Timer, VenetianMask];

export function Landing() {
  const tr = useT();
  const { intro, sections } = about[useLocale().locale];
  const [features, invite, madeIn] = sections;
  const [list, languages] = features!.body as [string[], string];
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "authed" && document.cookie.includes(`${SIGNED_IN_COOKIE}=`)) location.replace("/");
  }, [status]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <span className="text-lg font-bold tracking-tight">Six Frites</span>
        </span>
        <span className="flex items-center gap-1">
          <LanguageSelect />
          <Link href="/login" className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-stone-200 dark:hover:bg-stone-800">
            {tr.auth.signIn}
          </Link>
        </span>
      </header>

      <main>
        <section className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center sm:py-24">
          <Logo className="size-24 drop-shadow-md" />
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Six Frites</h1>
          <p className="text-lg leading-relaxed text-stone-600 sm:text-xl dark:text-stone-300">{intro}</p>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-stone-900 px-4 py-3 text-center font-semibold text-white transition active:scale-[0.98] dark:bg-stone-100 dark:text-stone-900"
            >
              {tr.auth.signIn}
            </Link>
            <AndroidDownload />
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">{features!.heading}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((item, i) => {
              const Icon = featureIcons[i] ?? Lock;
              return (
                <li key={item}>
                  <Card className="flex h-full items-start gap-3 p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
                      <Icon className="size-5" />
                    </span>
                    <span className="leading-relaxed text-stone-700 dark:text-stone-300">{item}</span>
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="text-center text-stone-500 dark:text-stone-400">{languages}</p>
        </section>

        <section className="grid gap-3 py-16 sm:grid-cols-2">
          {[invite!, madeIn!].map((s) => (
            <Card key={s.heading} className="space-y-2 p-6">
              <h2 className="text-lg font-semibold">{s.heading}</h2>
              <p className="leading-relaxed text-stone-700 dark:text-stone-300">{s.body[0] as string}</p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="space-y-3 border-t border-stone-200 pt-6 dark:border-stone-800">
        <Link href="/support" className="block text-center text-sm font-medium text-brand hover:underline">
          {tr.support.chatWithSupport}
        </Link>
        <LegalLinks />
      </footer>
    </div>
  );
}
