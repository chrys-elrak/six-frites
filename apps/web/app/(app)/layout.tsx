"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AnonInbox } from "@/components/anon-inbox";
import { setBrandSlot } from "@/components/brand-actions";
import { LockScreen } from "@/components/app-lock";
import { ChatList, useChatRail } from "@/components/chat-list";
import { Logo } from "@/components/logo";
import { SettingsPanel } from "@/components/settings-panel";
import { Notifications } from "@/components/notifications";
import { type Tab, TabBar } from "@/components/tab-bar";
import { useAppLock, useAutoLock } from "@/lib/app-lock";
import { BackLink, historyIndex, tabRoutes, useCloseOnBack, useGoUp } from "@/lib/back";
import { RealtimeProvider } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { primeAudio, useNotifyPrefs } from "@/lib/notify";
import { relinkPush } from "@/lib/push";
import { useAppHeight, useMedia } from "@/lib/viewport";
import { StoryPostBar } from "@/components/story-post-bar";
import { StorageFullPrompt } from "@/components/storage-full";
import { Toasts } from "@/components/toasts";
import { TourPrompt } from "@/components/tour";
import { UpdatePrompt } from "@/components/update-prompt";
import { LiveInvites, UnfinishedGame } from "@/components/live-invites";
import { CallScreen } from "@/components/call-screen";
import { MiniPlayer } from "@/components/mini-player";
import { BackupPinPrompt } from "@/components/encryption-settings";
import { Wallpaper } from "@/components/chat-background";
import { chatTheme, isLimited } from "@six/shared";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";

const glass = "bg-white/45 backdrop-blur-[2px] dark:bg-stone-950/55";
const solidOnDesktop = "md:bg-stone-50 md:backdrop-blur-none md:dark:bg-stone-950";
const appWallpaper = chatTheme(null);

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

/** A screen opened straight from a notification or link has nothing beneath it, so on a phone back goes to the chats instead of leaving. */
function BackFromDeepLink() {
  const pathname = usePathname();
  const goUp = useGoUp();
  const coarse = useMedia("(pointer: coarse)");
  useCloseOnBack(() => goUp("/"), coarse && historyIndex() === 0 && pathname !== "/");
  return null;
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
  const guest = useSession((s) => !!s.user && isLimited(s.user));
  const hasAppLock = useSession((s) => !!s.user?.hasAppLock);
  const locked = useAppLock((s) => s.locked) && hasAppLock;
  const tr = useT();
  useAppHeight();
  useAutoLock();
  useEffect(primeAudio, []);
  const railable = useChatRail();
  const lastTab = useRef<Tab>("chats");
  usePushLinks(status === "authed" && !guest);

  useEffect(() => {
    if (status === "anon") {
      qc.clear();
      router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, qc, pathname]);

  if (status === "authed" && guest) {
    return (
      <RealtimeProvider>
        <main className="relative isolate h-dvh">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <Wallpaper theme={appWallpaper} id="app" />
          </div>
          <div className={`h-full ${glass}`}>
            <div className="mx-auto h-full w-full max-w-2xl">
              <AnonInbox guest />
            </div>
          </div>
        </main>
      </RealtimeProvider>
    );
  }
  if (status !== "authed") {
    return <main className="grid h-dvh place-items-center text-sm text-stone-500">{tr.common.loading}</main>;
  }

  const topLevel = tabRoutes[pathname];
  if (topLevel) lastTab.current = topLevel;
  const tab = topLevel ?? (lastTab.current === "contacts" ? "contacts" : "chats");
  const wide = tab === "settings" || tab === "inbox" || tab === "notifications";
  const rail = railable && tab === "chats" && pathname !== "/archived";

  const brand = (
    <div
      className={`flex shrink-0 items-center gap-3 border-b border-black/5 px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 md:h-16 md:py-0 dark:border-white/10 ${rail ? `${glass} ${solidOnDesktop}` : ""}`}
    >
      <BackLink href="/" exact className="flex items-center gap-3">
        <Logo className="size-9" />
        <span className="text-lg font-bold tracking-tight whitespace-nowrap short:md:hidden">Six Frites</span>
      </BackLink>
      <TabBar active={tab} top />
      <div ref={setBrandSlot} className="-my-1 ml-auto flex items-center gap-1" />
    </div>
  );

  return (
    <RealtimeProvider>
      <div inert={locked} className="fixed inset-x-0 top-0 isolate flex h-[var(--app-height,100dvh)] flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <Wallpaper theme={appWallpaper} id="app" />
        </div>
        <MiniPlayer atTop={!rail} />
        {rail && brand}
        <div className="flex min-h-0 flex-1">
          <aside
            className={`${topLevel ? "flex" : "hidden"} w-full flex-col border-black/5 md:flex ${wide ? "md:flex-1" : `md:shrink-0 ${rail ? "md:w-20" : "md:w-100 md:shadow-[inset_-1px_0_0_rgb(0_0_0/0.05)] lg:w-116 md:dark:shadow-[inset_-1px_0_0_rgb(255_255_255/0.1)]"}`} dark:border-white/10 ${glass} ${wide ? "" : solidOnDesktop}`}
          >
            {!rail && brand}
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {!rail && (
                <div className="min-h-0 min-w-0 flex-1">
                  {tab === "chats" && <ChatList archived={pathname === "/archived"} />}
                  {tab === "contacts" && <ChatList contacts />}
                  {tab === "notifications" && <Notifications />}
                  {tab === "inbox" && <AnonInbox />}
                  {tab === "settings" && <SettingsPanel />}
                </div>
              )}
              <TabBar active={tab}>{rail && <ChatList rail />}</TabBar>
            </div>
          </aside>
          <section id="pane" className={`${topLevel ? "hidden" : "flex"} relative min-w-0 flex-1 flex-col ${wide ? "" : "md:flex"}`}>
            {children}
          </section>
        </div>
      </div>
      {!locked && <Toasts />}
      {!locked && <StoryPostBar />}
      {!locked && <StorageFullPrompt />}
      {!locked && <UpdatePrompt />}
      {!locked && <BackupPinPrompt />}
      {!locked && <TourPrompt />}
      {!locked && <LiveInvites />}
      {!locked && <UnfinishedGame />}
      <CallScreen />
      <UnreadTitle />
      <BackFromDeepLink />
      {locked && <LockScreen />}
    </RealtimeProvider>
  );
}
