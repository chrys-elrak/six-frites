"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LockScreen } from "@/components/app-lock";
import { ChatList } from "@/components/chat-list";
import { GamesPanel } from "@/components/games-panel";
import { Logo } from "@/components/logo";
import { SettingsPanel } from "@/components/settings-panel";
import { type Tab, TabBar } from "@/components/tab-bar";
import { useAppLock, useAutoLock } from "@/lib/app-lock";
import { RealtimeProvider } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { primeAudio, useNotifyPrefs } from "@/lib/notify";
import { relinkPush } from "@/lib/push";
import { useAppHeight } from "@/lib/viewport";
import { Toasts } from "@/components/toasts";
import { UpdatePrompt } from "@/components/update-prompt";
import { CallScreen } from "@/components/call-screen";
import { MiniPlayer } from "@/components/mini-player";
import { BackupPinPrompt } from "@/components/encryption-settings";
import { Wallpaper } from "@/components/chat-background";
import { chatTheme } from "@six/shared";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";

const glass = "bg-white/45 backdrop-blur-[2px] dark:bg-stone-950/55";
const appWallpaper = chatTheme(null);

const tabRoutes: Record<string, Tab> = {
  "/": "chats",
  "/archived": "chats",
  "/games": "games",
  "/settings": "settings",
};

function usePushLinks(signedIn: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!signedIn || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => null);
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
  const hasAppLock = useSession((s) => !!s.user?.hasAppLock);
  const locked = useAppLock((s) => s.locked) && hasAppLock;
  const tr = useT();
  useAppHeight();
  useAutoLock();
  useEffect(primeAudio, []);
  usePushLinks(status === "authed");

  useEffect(() => {
    if (status === "anon") {
      qc.clear();
      router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, qc, pathname]);

  if (status !== "authed") {
    return <main className="grid h-dvh place-items-center text-sm text-stone-500">{tr.common.loading}</main>;
  }

  const topLevel = tabRoutes[pathname];
  const tab = topLevel ?? "chats";
  const wide = tab === "settings" || tab === "games";

  return (
    <RealtimeProvider>
      <div inert={locked} className="fixed inset-x-0 top-0 isolate flex h-[var(--app-height,100dvh)] flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <Wallpaper theme={appWallpaper} id="app" />
        </div>
        <Link
          href="/"
          className={`${topLevel ? "flex" : "hidden"} shrink-0 items-center gap-3 border-b border-black/5 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 md:flex dark:border-white/10 ${glass}`}
        >
          <Logo className="size-9" />
          <span className="text-lg font-bold tracking-tight">Six Frites</span>
        </Link>
        <MiniPlayer atTop={!topLevel} />
        <div className="flex min-h-0 flex-1">
          <aside
            className={`${topLevel ? "flex" : "hidden"} w-full flex-col border-black/5 md:flex md:flex-row ${wide ? "md:flex-1" : "md:w-100 md:shrink-0 md:border-r lg:w-116"} dark:border-white/10 ${glass}`}
          >
            <div className="min-h-0 min-w-0 flex-1">
              {tab === "chats" && <ChatList archived={pathname === "/archived"} />}
              {tab === "games" && <GamesPanel />}
              {tab === "settings" && <SettingsPanel />}
            </div>
            <TabBar active={tab} />
          </aside>
          <section className={`${topLevel ? "hidden" : "flex"} min-w-0 flex-1 flex-col ${wide ? "" : "md:flex"}`}>
            {children}
          </section>
        </div>
      </div>
      {!locked && <Toasts />}
      {!locked && <UpdatePrompt />}
      {!locked && <BackupPinPrompt />}
      <CallScreen />
      <UnreadTitle />
      {locked && <LockScreen />}
    </RealtimeProvider>
  );
}
