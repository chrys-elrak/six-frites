"use client";

import { LOCALES, LOCALE_NAMES, isLocale } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { openBotChat } from "@/lib/chats";
import { useDataSaver } from "@/lib/data-saver";
import { signOut } from "@/lib/e2ee";
import { useLocale, useT } from "@/lib/i18n";
import { relinkPush } from "@/lib/push";
import { CHAT_LAYOUTS, setChatLayout, useChatLayout } from "@/lib/chat-layout";
import { THEMES, type ThemePref, readTheme, setTheme } from "@/lib/theme";
import { BlockedPeople, DeleteAccount } from "./account-settings";
import { AppLockSettings } from "./app-lock";
import { AdminLink } from "./admin/admin-link";
import { AndroidDownload } from "./android-download";
import { InstallCard } from "./install-card";
import { Devices } from "./devices";
import { EncryptionSettings, useHasRecoveryKey } from "./encryption-settings";
import { LegalLinks } from "./legal-page";
import { Referrals } from "./invites";
import { ProfileCard } from "./profile-card";
import { Sheet } from "./sheet";
import { QuickReactionsSettings } from "./reactions";
import { TourAgain } from "./tour";
import { Card, SectionTitle, Toggle } from "./ui";
import { BrandActions } from "./brand-actions";

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

function ThemePicker() {
  const tr = useT();
  const [theme, pick] = useState<ThemePref>(() => readTheme(document.documentElement.dataset.theme));
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.theme}</SectionTitle>
      <Card>
        <div role="radiogroup" aria-label={tr.settings.theme} className="flex gap-1 p-2">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => {
                setTheme(t);
                pick(t);
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                theme === t ? "bg-brand text-brand-ink" : "text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"
              }`}
            >
              {tr.settings.themes[t]}
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}

function LayoutPicker() {
  const tr = useT();
  const layout = useChatLayout((s) => s.layout);
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.chatLayout}</SectionTitle>
      <Card>
        <div role="radiogroup" aria-label={tr.settings.chatLayout} className="flex gap-1 p-2">
          {CHAT_LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              onClick={() => setChatLayout(l)}
              className={`flex-1 rounded-xl px-3 py-2 text-left transition ${
                layout === l ? "bg-brand text-brand-ink" : "text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"
              }`}
            >
              <span className="block text-sm font-medium">{tr.settings.layouts[l].label}</span>
              <span className="block text-xs opacity-75">{tr.settings.layouts[l].hint}</span>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}

function FontPicker() {
  const tr = useT();
  const [device, setDevice] = useState(() => document.documentElement.dataset.font !== "plain");
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.font}</SectionTitle>
      <Card>
        <Toggle
          label={tr.settings.deviceFont}
          hint={tr.settings.deviceFontHint}
          checked={device}
          onChange={(on) => {
            document.cookie = `font=${on ? "device" : "plain"}; path=/; max-age=31536000; samesite=lax`;
            if (on) delete document.documentElement.dataset.font;
            else document.documentElement.dataset.font = "plain";
            setDevice(on);
          }}
        />
      </Card>
    </section>
  );
}

/** When this web build was made, and its id, the same one /version reports. */
/** Opens the chat with Frite Bot, bringing it back to the chat list after it was deleted. */
function FriteBotSettings() {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const chat = await openBotChat(qc).catch(() => null);
    setBusy(false);
    if (chat) router.push(`/chats/${chat.id}`);
  }
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.common.games}</SectionTitle>
      <Card>
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.03] disabled:opacity-60 dark:hover:bg-white/5"
        >
          <img src="/frite-bot.svg" alt="" className="size-10 rounded-full" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{tr.calls.bot}</span>
            <span className="block text-sm text-stone-500 dark:text-stone-400">{tr.calls.botHint}</span>
          </span>
          <ChevronRight className="size-4 text-stone-400" />
        </button>
      </Card>
    </section>
  );
}

function DataSaverSettings() {
  const tr = useT();
  const saver = useDataSaver();
  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.dataUsage}</SectionTitle>
      <Card>
        <Toggle label={tr.settings.dataSaver} hint={tr.settings.dataSaverHint} checked={saver.on} onChange={saver.set} />
      </Card>
    </section>
  );
}

function BuildVersion() {
  const tr = useT();
  const { locale } = useLocale();
  const id = process.env.BUILD_ID!;
  const built = new Date(parseInt(id, 36)).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <p suppressHydrationWarning className="px-1 text-center text-xs text-stone-400 lg:[column-span:all]">
      {tr.common.version(`${built} · ${id}`)}
    </p>
  );
}

export function SettingsPanel() {
  const tr = useT();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const hasKey = useHasRecoveryKey();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BrandActions>
        <button
          onClick={() => setConfirmSignOut(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <LogOut className="size-4" />
          {tr.settings.signOut}
        </button>
      </BrandActions>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 lg:block lg:max-w-7xl lg:columns-2 lg:gap-6 lg:p-6 2xl:columns-3 lg:[&>*]:mb-6 lg:[&>*]:break-inside-avoid">
          <ProfileCard />
          <InstallCard />
          <AndroidDownload />
          <TourAgain />
          <LanguagePicker />
          <ThemePicker />
          <LayoutPicker />
          <FontPicker />
          <QuickReactionsSettings />
          <DataSaverSettings />
          <FriteBotSettings />
          <Referrals />
          <AppLockSettings />
          <EncryptionSettings />
          <Devices />
          <BlockedPeople />
          <DeleteAccount />
          <AdminLink />
          <LegalLinks className="lg:[column-span:all]" />
          <BuildVersion />
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
