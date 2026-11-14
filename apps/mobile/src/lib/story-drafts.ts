import type { AnonMessageDTO, GifDTO, StoryDrawing, StoryDTO, StoryLocation, StoryPositions } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import type { WrittenStyle } from "@/components/story-drawing";
import type { LocalFile } from "./send";

/** A story kept on this phone to finish later, as the composer had it. */
export interface StoryDraft {
  id: string;
  savedAt: string;
  text: string;
  background: string;
  mainStyle: WrittenStyle;
  file: LocalFile | null;
  photos: LocalFile[];
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
const root = new Directory(Paths.document, "story-drafts");

/**
 * Each draft is a folder holding draft.json and copies of its photos and videos. The JSON names its files rather
 * than giving their full path, since iOS moves the app's folder when it updates.
 */
async function listDrafts(): Promise<StoryDraft[]> {
  if (!root.exists) return [];
  const drafts = await Promise.all(
    root.list().map(async (dir) => {
      if (!(dir instanceof Directory)) return null;
      try {
        const d = JSON.parse(await new File(dir, "draft.json").text()) as StoryDraft;
        const at = (f: LocalFile) => ({ ...f, uri: new File(dir, f.uri).uri });
        return { ...d, file: d.file && at(d.file), photos: d.photos.map(at) };
      } catch {
        return null;
      }
    }),
  );
  return drafts.filter((d) => !!d).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export const useStoryDrafts = () => useQuery({ queryKey: draftsKey, queryFn: listDrafts, staleTime: Infinity });

export async function saveDraft(draft: StoryDraft) {
  const dir = new Directory(root, draft.id);
  dir.create({ intermediates: true, idempotent: true });
  const kept = new Set(["draft.json"]);
  const store = (f: LocalFile, i: number) => {
    let name = f.uri.startsWith(dir.uri) ? f.uri.slice(dir.uri.length) : "";
    if (!name) {
      name = `${Date.now()}-${i}-${f.name.replace(/[^\w.-]/g, "_")}`;
      new File(f.uri).copy(new File(dir, name));
    }
    kept.add(name);
    return { ...f, uri: name };
  };
  const json = { ...draft, file: draft.file && store(draft.file, 0), photos: draft.photos.map((p, i) => store(p, i + 1)) };
  const out = new File(dir, "draft.json");
  if (!out.exists) out.create();
  out.write(JSON.stringify(json));
  for (const f of dir.list()) if (!kept.has(f.name)) f.delete();
}

export function deleteDraft(id: string) {
  const dir = new Directory(root, id);
  if (dir.exists) dir.delete();
}
