"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";

/** Offers a reload once a newer build of the web app is deployed. */
export function UpdatePrompt() {
  const tr = useT();
  const [dismissed, setDismissed] = useState<string>();
  const live = useQuery({
    queryKey: ["web-build"],
    queryFn: async () => ((await (await fetch("/version", { cache: "no-store" })).json()) as { build: string }).build,
    refetchInterval: 5 * 60_000,
  });
  if (!live.data || live.data === process.env.BUILD_ID || live.data === dismissed) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_180ms_ease-out] items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-stone-200 backdrop-blur dark:bg-stone-900/95 dark:ring-stone-800">
        <RefreshCw className="size-5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 text-sm font-medium">{tr.common.newWebVersion}</span>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
        >
          {tr.common.update}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(live.data)}
          aria-label={tr.common.dismiss}
          className="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
