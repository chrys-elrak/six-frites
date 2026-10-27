"use client";

import { LOCALES, LOCALE_NAMES, isLocale } from "@six/shared";
import { Check, Copy, Keyboard, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/e2ee";
import { useLocale, useT } from "@/lib/i18n";
import { relinkPush } from "@/lib/push";
import { BlockedPeople, DeleteAccount } from "./account-settings";
import { AppLockSettings } from "./app-lock";
import { AdminLink } from "./admin/admin-link";
import { AndroidDownload } from "./android-download";
import { ChatBackgroundPicker } from "./chat-background";
import { Devices } from "./devices";
import { EncryptionSettings, useHasRecoveryKey } from "./encryption-settings";
import { FindMe } from "./find-me";
import { Invites, Referrals } from "./invites";
import { NotificationSettings } from "./notification-settings";
import { ProfileCard } from "./profile-card";
import { Sheet } from "./sheet";
import { Card, SectionTitle } from "./ui";

function LanguagePicker() {
  const tr = useT();
  const { locale, setLocale } = useLocale();
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.common.language}</SectionTitle>
      <Card>
        <label className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1 text-sm text-stone-500 dark:text-stone-400">{tr.settings.languageHint}</span>
          <select
            value={locale}
            onChange={(e) => {
              if (!isLocale(e.target.value)) return;
              setLocale(e.target.value);
              void relinkPush().catch(() => null);
            }}
            className="rounded-lg bg-stone-100 px-3 py-2 font-medium dark:bg-stone-800"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
      </Card>
    </section>
  );
}

const MEDIA_FLAG = "chrome://flags/#enable-android-media-insertion";

/** Chrome on Android only hands keyboard GIFs and stickers to web pages behind a flag, and pages can't link to chrome:// addresses. */
function KeyboardMedia() {
  const tr = useT();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const ua = (navigator as { userAgentData?: { platform: string; brands: { brand: string }[] } }).userAgentData;
    setShown(ua?.platform === "Android" && ua.brands.some((b) => b.brand === "Google Chrome"));
  }, []);
  if (!shown) return null;

  async function copy() {
    if (!(await navigator.clipboard.writeText(MEDIA_FLAG).then(() => true, () => false))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.keyboardMedia.title}</SectionTitle>
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <Keyboard className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-stone-500 dark:text-stone-400">{tr.settings.keyboardMedia.hint}</p>
          <code className="block rounded-lg bg-stone-100 px-3 py-2 text-xs break-all select-all dark:bg-stone-800">
            {MEDIA_FLAG}
          </code>
          <button
            onClick={() => void copy()}
            className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? tr.settings.keyboardMedia.copied : tr.settings.keyboardMedia.copy}
          </button>
        </div>
      </Card>
    </section>
  );
}

export function SettingsPanel() {
  const tr = useT();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const hasKey = useHasRecoveryKey();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">{tr.common.settings}</h1>
        <button
          onClick={() => setConfirmSignOut(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <LogOut className="size-4" />
          {tr.settings.signOut}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 lg:block lg:max-w-7xl lg:columns-2 lg:gap-6 lg:p-6 2xl:columns-3 lg:[&>*]:mb-6 lg:[&>*]:break-inside-avoid">
          <ProfileCard />
          <AndroidDownload />
          <LanguagePicker />
          <FindMe />
          <ChatBackgroundPicker />
          <KeyboardMedia />
          <NotificationSettings />
          <Invites />
          <Referrals />
          <AppLockSettings />
          <EncryptionSettings />
          <Devices />
          <BlockedPeople />
          <DeleteAccount />
          <AdminLink />
          <p className="px-1 pb-2 text-center text-xs leading-relaxed text-stone-400 lg:[column-span:all]">
            {tr.settings.creditsFrom}{" "}
            <a
              href="https://googlefonts.github.io/noto-emoji-animation/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Noto Emoji Animation
            </a>{" "}
            {tr.settings.creditsBy}{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              CC BY 4.0
            </a>
            . {tr.settings.creditsData}
          </p>
        </div>
      </div>
      {confirmSignOut && (
        <Sheet
          title={hasKey.data ? tr.settings.signOutWithKey : tr.settings.signOutWithoutKey}
          actions={[{ label: tr.settings.signOut, destructive: true, onSelect: () => void signOut() }]}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
    </div>
  );
}
