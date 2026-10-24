"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatList } from "@/components/chat-list";
import { ContactList } from "@/components/contact-list";
import { SettingsPanel } from "@/components/settings-panel";
import { type Tab, TabBar } from "@/components/tab-bar";
import { RealtimeProvider } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useAppHeight } from "@/lib/viewport";

const tabRoutes: Record<string, Tab> = {
  "/": "chats",
  "/archived": "chats",
  "/contacts": "contacts",
  "/settings": "settings",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const status = useSession((s) => s.status);
  useAppHeight();

  useEffect(() => {
    if (status === "anon") {
      qc.clear();
      router.replace("/login");
    }
  }, [status, router, qc]);

  if (status !== "authed") {
    return <main className="grid h-dvh place-items-center text-sm text-stone-500">Loading…</main>;
  }

  const topLevel = tabRoutes[pathname];
  const tab = topLevel ?? "chats";

  return (
    <RealtimeProvider>
      <div className="fixed inset-x-0 top-0 flex h-[var(--app-height,100dvh)] overflow-hidden">
        <aside
          className={`${topLevel ? "flex" : "hidden"} w-full flex-col border-stone-200 md:flex md:w-80 md:shrink-0 md:border-r lg:w-96 dark:border-stone-800`}
        >
          <div className="min-h-0 flex-1">
            {tab === "chats" && <ChatList archived={pathname === "/archived"} />}
            {tab === "contacts" && <ContactList />}
            {tab === "settings" && <SettingsPanel />}
          </div>
          <TabBar active={tab} />
        </aside>
        <section className={`${topLevel ? "hidden" : "flex"} min-w-0 flex-1 flex-col md:flex`}>{children}</section>
      </div>
    </RealtimeProvider>
  );
}
