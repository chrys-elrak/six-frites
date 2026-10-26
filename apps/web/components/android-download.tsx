"use client";

import { Download, Smartphone } from "lucide-react";
import { useAndroidApp } from "@/lib/android-app";
import { formatBytes } from "@/lib/format";

export function AndroidDownload({ compact = false }: { compact?: boolean }) {
  const app = useAndroidApp();
  if (!app.data) return null;
  const { version, size, downloadUrl } = app.data;

  if (compact) {
    return (
      <a
        href={downloadUrl}
        className="mx-auto flex items-center justify-center gap-2 text-sm font-medium text-stone-600 underline-offset-4 hover:underline dark:text-stone-300"
      >
        <Smartphone className="size-4" />
        Get the Android app
      </a>
    );
  }

  return (
    <a
      href={downloadUrl}
      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800"
    >
      <Smartphone className="size-5 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Android app</span>
        <span className="block text-xs text-stone-500">
          Version {version} · {formatBytes(size)}
        </span>
      </span>
      <Download className="size-5 text-stone-400" />
    </a>
  );
}
