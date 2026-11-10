import { type UploadOptions, unwrap } from "@six/sdk";
import type { CreateStoryInput } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { create } from "zustand";
import { getT } from "./i18n";
import { six } from "./six";

interface StoryPost {
  state: "posting" | "done" | "failed" | null;
  progress: number;
  retry: (() => void) | null;
}

/** The story being shared in the background, for the bar that follows it. */
export const useStoryPost = create<StoryPost>(() => ({ state: null, progress: 0, retry: null }));

const ID = "story-post";
let hide: ReturnType<typeof setTimeout> | undefined;

const bar = (p: number) => `${"▰".repeat(Math.round(p * 12))}${"▱".repeat(12 - Math.round(p * 12))}  ${Math.round(p * 100)}%`;

async function notify(title: string, body: string, channelId: string, sticky = false) {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: { title, body, sticky, autoDismiss: !sticky, data: { url: "/" } },
    trigger: { channelId },
  });
}

/**
 * Uploads a story's photo or video, if any, then shares it, while the composer is already closed. A notification
 * follows the upload in the status bar and says when it's done; a failure keeps everything for a retry.
 */
// ponytail: one story at a time; a second one started meanwhile takes over the bar and the notification
export async function postStory(qc: QueryClient, body: CreateStoryInput, file?: { uri: string } & Omit<UploadOptions, "onProgress">) {
  const tr = getT();
  const set = useStoryPost.setState;
  clearTimeout(hide);
  set({ state: "posting", progress: 0, retry: null });
  let shown = -1;
  const step = (p: number) => {
    set({ progress: p });
    const pct = Math.floor(p * 20);
    if (pct === shown) return;
    shown = pct;
    void notify(tr.stories.postingStory, bar(p), "uploads", true).catch(() => null);
  };
  step(0);
  try {
    const upload = file
      ? await six.upload(await (await fetch(file.uri)).blob(), { ...file, onProgress: step })
      : null;
    unwrap(await six.api.POST("/v1/stories", { body: { ...body, uploadId: upload?.id, background: upload ? undefined : body.background } }));
    void qc.invalidateQueries({ queryKey: ["stories"] });
    set((s) => (s.state ? { state: "done", progress: 1 } : {}));
    hide = setTimeout(() => set({ state: null }), 3000);
    void notify(tr.stories.posted, "", "in-app").catch(() => null);
  } catch {
    set({ state: "failed", retry: () => void postStory(qc, body, file) });
    void notify(tr.stories.couldNotPostShort, tr.stories.couldNotPost, "in-app").catch(() => null);
  }
}
