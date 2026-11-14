import { type UploadOptions, unwrap } from "@six/sdk";
import type { CreateStoryInput } from "@six/shared";
import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { six } from "./six";

interface StoryPost {
  state: "posting" | "done" | "failed" | null;
  progress: number;
  retry: (() => void) | null;
}

/** The story being shared in the background, for the bar that follows it. */
export const useStoryPost = create<StoryPost>(() => ({ state: null, progress: 0, retry: null }));

let hide: ReturnType<typeof setTimeout> | undefined;

/**
 * Uploads a story's photo or video, if any, then shares it, while the composer is already closed. A failure keeps
 * everything for a retry. Says whether it went up.
 */
// ponytail: one story at a time; a second one started meanwhile takes over the bar
export async function postStory(qc: QueryClient, body: CreateStoryInput, file?: { blob: Blob } & Omit<UploadOptions, "onProgress">): Promise<boolean> {
  const set = useStoryPost.setState;
  clearTimeout(hide);
  set({ state: "posting", progress: 0, retry: null });
  try {
    const upload = file ? await six.upload(file.blob, { ...file, onProgress: (progress) => set({ progress }) }) : null;
    unwrap(await six.api.POST("/v1/stories", { body: { ...body, uploadId: upload?.id, background: upload ? undefined : body.background } }));
    void qc.invalidateQueries({ queryKey: ["stories"] });
    set((s) => (s.state ? { state: "done", progress: 1 } : {}));
    hide = setTimeout(() => set({ state: null }), 3000);
    return true;
  } catch {
    set({ state: "failed", retry: () => void postStory(qc, body, file) });
    return false;
  }
}
