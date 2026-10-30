"use client";

import { CHANGELOG, type Release, unseenReleases } from "@six/shared";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { Dialog } from "./dialog";

const SEEN_KEY = "six:seen-release";

function ReleaseNotes({ releases, onClose }: { releases: Release[]; onClose: () => void }) {
  const tr = useT();
  const { locale } = useLocale();
  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.common.whatsNew}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-5 p-4">
        {releases.map((r) => (
          <section key={r.version}>
            <h3 className="text-sm font-semibold">
              {tr.common.version(r.version)}{" "}
              <span className="font-normal text-stone-500">
                · {new Date(r.date).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" })}
              </span>
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-stone-700 dark:text-stone-300">
              {r.notes[locale].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function WhatsNew() {
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800"
      >
        <Sparkles className="size-5 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{tr.common.whatsNew}</span>
          <span className="block text-xs text-stone-500">{tr.common.version(CHANGELOG[0]!.version)}</span>
        </span>
        <ChevronRight className="size-5 text-stone-400" />
      </button>
      {open && <ReleaseNotes releases={CHANGELOG} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Shows the releases that came out since this browser last read them, or the newest one the first time. */
export function WhatsNewPrompt() {
  const [fresh, setFresh] = useState(() => {
    try {
      return unseenReleases(localStorage.getItem(SEEN_KEY));
    } catch {
      return [];
    }
  });
  if (!fresh.length) return null;

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, CHANGELOG[0]!.version);
    } catch {}
    setFresh([]);
  }

  return <ReleaseNotes releases={fresh} onClose={close} />;
}
