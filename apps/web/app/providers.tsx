"use client";

import type { Locale } from "@six/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { TermsGate } from "@/components/terms-gate";
import { LocaleProvider } from "@/lib/i18n";
import { LocaleSync } from "@/lib/locale-sync";
import { useSession } from "@/lib/session";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const block = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("input, textarea, [contenteditable]")) e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  return (
    <LocaleProvider initial={locale}>
      <QueryClientProvider client={client}>
        {children}
        <TermsGate />
        <LocaleSync />
      </QueryClientProvider>
    </LocaleProvider>
  );
}
