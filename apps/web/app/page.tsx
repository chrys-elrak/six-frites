"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Devices } from "@/components/devices";
import { Invites, Referrals } from "@/components/invites";
import { ProfileCard } from "@/components/profile-card";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";

export default function Home() {
  const router = useRouter();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "authed") {
    return <main className="grid min-h-dvh place-items-center text-sm text-stone-500">Loading…</main>;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">🍟 Six Frites</h1>
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
  );
}
