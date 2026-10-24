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
import { primeAudio, useNotifyPrefs } from "@/lib/notify";
import { relinkPush } from "@/lib/push";
import { useAppHeight } from "@/lib/viewport";
import { Toasts } from "@/components/toasts";
import { useChats } from "@/lib/chats";

const tabRoutes: Record<string, Tab> = {
  "/": "chats",
  "/archived": "chats",
  "/contacts": "contacts",
  "/settings": "settings",
};

function usePushLinks(signedIn: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!signedIn || !("serviceWorker" in navigator)) return;
    if (useNotifyPrefs.getState().push) void relinkPush().catch(() => null);
    const onMessage = (e: MessageEvent) => e.data?.type === "open" && router.push(e.data.url);
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [signedIn, router]);
}

function UnreadTitle() {
  const chats = useChats();
  const unread = chats.data?.filter((c) => !c.muted).reduce((n, c) => n + c.unreadCount, 0) ?? 0;
  useEffect(() => {
    document.title = unread ? `(${unread > 99 ? "99+" : unread}) Six Frites` : "Six Frites";
  }, [unread]);
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const status = useSession((s) => s.status);
  useAppHeight();
  useEffect(primeAudio, []);
  usePushLinks(status === "authed");

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
      <Toasts />
      <UnreadTitle />
    </RealtimeProvider>
  );
}
