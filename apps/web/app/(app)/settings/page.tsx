"use client";

import Link from "next/link";
import { Devices } from "@/components/devices";
import { Invites, Referrals } from "@/components/invites";
import { ProfileCard } from "@/components/profile-card";
import { six } from "@/lib/six";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2">
          <Link
            href="/"
            aria-label="Back to chats"
            className="-ml-2 grid size-10 place-items-center rounded-full text-2xl hover:bg-stone-200 md:hidden dark:hover:bg-stone-800"
          >
            ‹
          </Link>
          <h1 className="flex-1 text-xl font-semibold tracking-tight">Settings</h1>
          <button
            onClick={() => void six.auth.logout()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Sign out
          </button>
        </header>
        <ProfileCard />
        <Invites />
        <Referrals />
        <Devices />
      </main>
    </div>
  );
}
