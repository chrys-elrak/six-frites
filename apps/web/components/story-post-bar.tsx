"use client";

import { CheckCircle2, Loader2, TriangleAlert, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useStoryPost } from "@/lib/story-post";
import { Portal } from "./portal";

/** Follows a story being shared in the background: its progress, then that it's up, or a retry if it failed. */
export function StoryPostBar() {
  const tr = useT();
  const { state, progress, retry } = useStoryPost();
  if (!state) return null;

  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:justify-end md:p-4">
        <div
          role="status"
          className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl bg-white/85 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:bg-stone-900/85 dark:ring-white/10"
        >
          <div className="flex items-center gap-3 px-4 py-3 text-sm">
            {state === "posting" && <Loader2 className="size-5 shrink-0 animate-spin text-brand" />}
            {state === "done" && <CheckCircle2 className="size-5 shrink-0 text-green-600" />}
            {state === "failed" && <TriangleAlert className="size-5 shrink-0 text-red-600" />}
            <span className="min-w-0 flex-1 truncate font-medium">
              {state === "posting"
                ? `${tr.stories.postingStory} ${Math.round(progress * 100)}%`
                : state === "done"
                  ? tr.stories.posted
                  : tr.stories.couldNotPostShort}
            </span>
            {state === "failed" && (
              <>
                <button type="button" onClick={() => retry?.()} className="font-semibold text-brand">
                  {tr.common.retry}
                </button>
                <button
                  type="button"
                  onClick={() => useStoryPost.setState({ state: null, retry: null })}
                  aria-label={tr.common.dismiss}
                  className="grid size-7 place-items-center rounded-full text-stone-400 hover:bg-stone-900/5"
                >
                  <X className="size-4" />
                </button>
              </>
            )}
          </div>
          {state === "posting" && (
            <div className="h-1 bg-brand/15">
              <div className="h-full bg-brand transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
