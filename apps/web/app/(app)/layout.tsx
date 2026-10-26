"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatList } from "@/components/chat-list";
import { ContactList } from "@/components/contact-list";
import { Logo } from "@/components/logo";
import { SettingsPanel } from "@/components/settings-panel";
import { type Tab, TabBar } from "@/components/tab-bar";
import { RealtimeProvider } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { primeAudio, useNotifyPrefs } from "@/lib/notify";
import { relinkPush } from "@/lib/push";
import { useAppHeight } from "@/lib/viewport";
import { Toasts } from "@/components/toasts";
import { CallScreen } from "@/components/call-screen";
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
      router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, qc, pathname]);

  if (status !== "authed") {
    return <main className="grid h-dvh place-items-center text-sm text-stone-500">Loading…</main>;
  }

  const topLevel = tabRoutes[pathname];
  const tab = topLevel ?? "chats";

  return (
    <RealtimeProvider>
      <div className="fixed inset-x-0 top-0 flex h-[var(--app-height,100dvh)] flex-col overflow-hidden">
        <Link
          href="/"
          className={`${topLevel ? "flex" : "hidden"} shrink-0 items-center gap-2 border-b border-stone-200 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:flex dark:border-stone-800`}
        >
          <Logo className="size-7" />
          <span className="text-[15px] font-bold tracking-tight">Six Frites</span>
        </Link>
        <div className="flex min-h-0 flex-1">
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
      </div>
      <Toasts />
      <CallScreen />
      <UnreadTitle />
    </RealtimeProvider>
  );
}
