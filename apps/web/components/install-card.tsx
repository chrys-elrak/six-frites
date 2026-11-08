"use client";

import { Share, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { install, useInstallWay } from "@/lib/install";

const DISMISSED = "six:install-dismissed";

/**
 * Asks to install Six Frites where the browser can: a button on Chrome and Edge, the two Share menu steps on an
 * iPhone, where notifications only come once it's on the home screen. `dismissible` lets it be closed for good.
 */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const tr = useT();
  const t = tr.settings;
  const way = useInstallWay();
  const [hidden, setHidden] = useState(() => {
    try {
      return dismissible && localStorage.getItem(DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  if (!way || hidden) return null;

  return (
    <div className="relative flex gap-3 rounded-2xl bg-surface backdrop-blur-md p-4 pr-10 shadow-sm ring-1 ring-surface-line">
      <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{t.installTitle}</p>
        {way === "prompt" ? (
          <>
            <p className="text-stone-500 dark:text-stone-400">{t.installHint}</p>
            <button
              type="button"
              onClick={() => void install()}
              className="mt-2 rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-ink hover:brightness-105"
            >
              {t.install}
            </button>
          </>
        ) : (
          <>
            <ol className="mt-1 space-y-1 text-stone-700 dark:text-stone-300">
              <li className="flex items-center gap-1.5">
                1. {t.iosStep1}
                <Share className="size-4 text-sky-500" aria-hidden />
              </li>
              <li>2. {t.iosStep2}</li>
            </ol>
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{t.iosNotifications}</p>
          </>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(DISMISSED, "1");
            } catch {}
          }}
          aria-label={tr.common.close}
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
