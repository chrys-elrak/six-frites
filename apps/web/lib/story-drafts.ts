import type { AnonMessageDTO, GifDTO, StoryDrawing, StoryDTO, StoryLocation, StoryPositions } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import type { WrittenStyle } from "@/components/story-drawing";

/** A story kept in this browser to finish later, as the composer had it, its photo, video and photo stickers included. */
export interface StoryDraft {
  id: string;
  savedAt: string;
  text: string;
  background: string;
  mainStyle: WrittenStyle;
  file: File | null;
  photos: File[];
  gifs: GifDTO[];
  asks: AnonMessageDTO[];
  link: { url: string; label: string } | null;
  askLink: boolean;
  askText: string;
  location: StoryLocation | null;
  showDate: boolean;
  showTime: boolean;
  positions: StoryPositions;
  drawing: StoryDrawing;
  durationSecs: number;
  shared: { bubble?: string; quote?: StoryDTO["quote"] & { messageId: string } } | null;
}

export const draftsKey = ["story-drafts"] as const;

/** Runs one request on the drafts store, which IndexedDB keeps with its files. */
function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open("story-drafts", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = act(open.result.transaction("drafts", mode).objectStore("drafts"));
      req.onsuccess = () => {
        resolve(req.result);
        open.result.close();
      };
      req.onerror = () => reject(req.error);
    };
  });
}

export const useStoryDrafts = () =>
  useQuery({
    queryKey: draftsKey,
    queryFn: async () => (await run<StoryDraft[]>("readonly", (s) => s.getAll())).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    staleTime: Infinity,
  });

export const saveDraft = (draft: StoryDraft) => run("readwrite", (s) => s.put(draft));
export const deleteDraft = (id: string) => run("readwrite", (s) => s.delete(id));
