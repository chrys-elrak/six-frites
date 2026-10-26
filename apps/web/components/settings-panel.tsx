"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { signOut } from "@/lib/e2ee";
import { BlockedPeople, DeleteAccount } from "./account-settings";
import { AdminLink } from "./admin/admin-link";
import { AndroidDownload } from "./android-download";
import { ChatBackgroundPicker } from "./chat-background";
import { Devices } from "./devices";
import { EncryptionSettings, useHasRecoveryKey } from "./encryption-settings";
import { FindMe } from "./find-me";
import { Invites, Referrals } from "./invites";
import { NotificationSettings } from "./notification-settings";
import { PrivacyCodeSettings } from "./privacy-code";
import { ProfileCard } from "./profile-card";
import { Sheet } from "./sheet";

export function SettingsPanel() {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const hasKey = useHasRecoveryKey();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">Settings</h1>
        <button
          onClick={() => setConfirmSignOut(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4">
          <ProfileCard />
          <AndroidDownload />
          <FindMe />
          <ChatBackgroundPicker />
          <NotificationSettings />
          <Invites />
          <Referrals />
          <PrivacyCodeSettings />
          <EncryptionSettings />
          <Devices />
          <BlockedPeople />
          <DeleteAccount />
          <AdminLink />
          <p className="px-1 pb-2 text-center text-xs leading-relaxed text-stone-400">
            Animated emoji from{" "}
            <a
              href="https://googlefonts.github.io/noto-emoji-animation/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Noto Emoji Animation
            </a>{" "}
            by Google, licensed{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              CC BY 4.0
            </a>
            . Emoji data from Emojibase.
          </p>
        </div>
      </div>
      {confirmSignOut && (
        <Sheet
          title={
            hasKey.data
              ? "Sign out? Your encrypted messages are removed from this browser. You can read them again with your recovery key."
              : "Sign out? Your encrypted messages are removed from this browser, and without a recovery key you won't be able to read them here again."
          }
          actions={[{ label: "Sign out", destructive: true, onSelect: () => void signOut() }]}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
    </div>
  );
}
