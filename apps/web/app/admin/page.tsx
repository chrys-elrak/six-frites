"use client";

import { unwrap } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Overview } from "@/components/admin/overview";
import { Packs } from "@/components/admin/packs";
import { Reports } from "@/components/admin/reports";
import { Users } from "@/components/admin/users";
import { adminKeys, useIsAdmin } from "@/lib/admin";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";

type Tab = "overview" | "reports" | "users" | "stickers";

export default function AdminPage() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const admin = useIsAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  const stats = useQuery({
    queryKey: adminKeys.stats,
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/stats")),
    enabled: !!admin.data,
  });

  useEffect(() => {
    if (status === "anon") router.replace("/login?next=/admin");
  }, [status, router]);

  if (status !== "authed" || admin.isPending) {
    return <main className="grid min-h-dvh place-items-center text-sm text-stone-500">Loading…</main>;
  }
  if (!admin.data) {
    return (
      <main className="grid min-h-dvh place-items-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium">You don't have access to moderation.</p>
          <Link href="/" className="text-sm text-stone-500 underline">
            Back to chats
          </Link>
        </div>
      </main>
    );
  }

  const open = stats.data?.openReports ?? 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "reports", label: open ? `Reports (${open})` : "Reports" },
    { id: "users", label: "People" },
    { id: "stickers", label: "Sticker packs" },
  ];

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-12">
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/settings"
          aria-label="Back to the app"
          className="grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <ShieldCheck className="size-6 text-brand" />
        <h1 className="text-xl font-semibold tracking-tight">Moderation</h1>
      </header>
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-stone-200 dark:border-stone-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-brand text-stone-900 dark:text-stone-100"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" && <Overview />}
      {tab === "reports" && <Reports />}
      {tab === "users" && <Users />}
      {tab === "stickers" && <Packs />}
    </main>
  );
}
