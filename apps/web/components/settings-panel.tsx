"use client";

import { LOCALES, LOCALE_NAMES, isLocale } from "@six/shared";
import { LogOut } from "lucide-react";
import { useState } from "react";
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
