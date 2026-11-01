"use client";

import type { Locale } from "@six/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { LanguageSelect } from "@/components/language-select";
import { Logo } from "@/components/logo";
import { useLocale, useT } from "@/lib/i18n";
import type { LegalDoc } from "@/lib/legal";

export function LegalLinks({ className = "" }: { className?: string }) {
  const tr = useT();
  return (
    <nav className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400 ${className}`}>
      <Link href="/about" className="hover:underline">
        {tr.legal.about}
      </Link>
      <Link href="/terms" className="hover:underline">
        {tr.legal.terms}
      </Link>
      <Link href="/privacy" className="hover:underline">
        {tr.legal.privacy}
      </Link>
    </nav>
  );
}

export function LegalPage({ doc }: { doc: Record<Locale, LegalDoc> }) {
  const tr = useT();
  const { title, updated, intro, sections } = doc[useLocale().locale];
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          aria-label={tr.common.back}
          title={tr.common.back}
          className="grid size-10 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <LanguageSelect />
      </div>
      <article className="space-y-8 py-6">
        <header className="space-y-3">
          <Logo className="size-14" />
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {updated && <p className="text-sm text-stone-500 dark:text-stone-400">{updated}</p>}
          <p className="text-lg leading-relaxed text-stone-700 dark:text-stone-300">{intro}</p>
        </header>
        {sections.map((s) => (
          <section key={s.heading} className="space-y-3">
            <h2 className="text-lg font-semibold">{s.heading}</h2>
            {s.body.map((part, i) =>
              typeof part === "string" ? (
                <p key={i} className="leading-relaxed text-stone-700 dark:text-stone-300">
                  {part}
                </p>
              ) : (
                <ul key={i} className="list-disc space-y-1.5 pl-5 leading-relaxed text-stone-700 dark:text-stone-300">
                  {part.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
      </article>
      <LegalLinks className="border-t border-stone-200 pt-6 dark:border-stone-800" />
    </main>
  );
}
