"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useCallback, useEffect, useRef } from "react";
import type { Tab } from "@/components/tab-bar";

declare class CloseWatcher {
  onclose: (() => void) | null;
  destroy(): void;
}

interface NavigationApi {
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
}

export const tabRoutes: Record<string, Tab> = {
  "/": "chats",
  "/archived": "chats",
  "/contacts": "contacts",
  "/notifications": "notifications",
  "/inbox": "inbox",
  "/settings": "settings",
};

const navigationApi = () => (window as unknown as { navigation?: NavigationApi }).navigation;

/** Where this page sits in the tab's history, 0 when nothing of ours is beneath it. Undefined where the browser can't tell. */
export const historyIndex = () => navigationApi()?.currentEntry?.index;

const escapes: unknown[] = [];

/**
 * Runs `onClose` when the phone's back button or Escape is pressed, while `on`. Only the most recently opened
 * overlay hears it. CloseWatcher takes the back press before history does, so no fake history entries are needed;
 * browsers without it fall back to Escape alone. It's re-armed after each close because `onClose` may only step
 * back inside the overlay rather than shut it.
 */
export function useCloseOnBack(onClose: () => void, on = true) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    if (!on) return;
    if (typeof CloseWatcher === "undefined") {
      escapes.push(latest);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && escapes.at(-1) === latest) latest.current();
      };
      window.addEventListener("keydown", onKey);
      return () => {
        escapes.splice(escapes.indexOf(latest), 1);
        window.removeEventListener("keydown", onKey);
      };
    }
    let live = true;
    let watcher: CloseWatcher;
    const arm = () => {
      watcher = new CloseWatcher();
      watcher.onclose = () => {
        latest.current();
        if (live) arm();
      };
    };
    arm();
    return () => {
      live = false;
      watcher.destroy();
    };
  }, [on]);
}

/**
 * Goes up to a parent screen by walking back through history to it, so the stack shrinks and the next back press
 * doesn't return to the screen just left. With nothing to walk back to it replaces the current entry with `href`.
 * The target is the nearest tab screen, so a chat opened from Contacts returns there; `exact` insists on `href`.
 */
export function useGoUp() {
  const router = useRouter();
  return useCallback(
    (href: string, exact = false) => {
      if (location.pathname === href) return;
      const entries = navigationApi()?.entries() ?? [];
      for (let i = (historyIndex() ?? 0) - 1; i >= 0; i--) {
        const path = new URL(entries[i]!.url!).pathname;
        if (exact ? path === href : path in tabRoutes) {
          history.go(i - historyIndex()!);
          return;
        }
      }
      router.replace(href);
    },
    [router],
  );
}

export function BackLink({ href, exact, ...props }: ComponentProps<typeof Link> & { href: string; exact?: boolean }) {
  const goUp = useGoUp();
  return (
    <Link
      {...props}
      href={href}
      replace
      onClick={(e) => {
        e.preventDefault();
        goUp(href, exact);
      }}
    />
  );
}
