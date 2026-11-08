"use client";

import { ExternalLink, Smartphone } from "lucide-react";
import { useAndroidApp } from "@/lib/android-app";
import { formatBytes } from "@/lib/format";
import { useT } from "@/lib/i18n";

export function AndroidDownload({ compact = false }: { compact?: boolean }) {
  const tr = useT();
  const app = useAndroidApp();
  if (!app.data) return null;
  const { version, size, downloadUrl } = app.data;

  if (compact) {
    return (
      <a
        href={downloadUrl}
        target="_blank"
        rel="noreferrer"
        className="mx-auto flex items-center justify-center gap-2 text-sm font-medium text-stone-600 underline-offset-4 hover:underline dark:text-stone-300"
      >
        <Smartphone className="size-4" />
        {tr.auth.getAndroidApp}
      </a>
    );
  }

  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl bg-surface backdrop-blur-md px-4 py-3 shadow-sm ring-1 ring-surface-line hover:bg-white/80 dark:hover:bg-stone-800/70"
    >
      <Smartphone className="size-5 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{tr.auth.androidApp}</span>
        <span className="block text-xs text-stone-500">
          {tr.auth.version(version, formatBytes(size))}
        </span>
      </span>
      <ExternalLink className="size-5 text-stone-400" />
    </a>
  );
}
