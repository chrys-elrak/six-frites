import { unwrap } from "@six/sdk";
import { type StickerPackDTO, emojiForFileName } from "@six/shared";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { emojiList } from "./emoji";
import { six } from "./six";

export const stickerKeys = {
  packs: ["sticker-packs"] as const,
  pack: (id: string) => ["sticker-pack", id] as const,
};

export const STICKER_ACCEPT = ".tgs,.json,.webp,.png,application/json,image/webp,image/png";
export const STICKER_EXTENSIONS = /\.(tgs|json|webp|png)$/i;

/** The files in what was dropped, reading dropped folders and the folders inside them; each keeps its path in `webkitRelativePath`, as a picked folder's files do. */
export async function droppedFiles(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push(Object.defineProperty(file, "webkitRelativePath", { value: entry.fullPath.replace(/^\//, "") }));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

/** The emoji a sticker file stands for, from its name (see emojiForFileName). */
export async function emojiForFile(name: string) {
  const list = await emojiList();
  return emojiForFileName(name, (n) => list.find((e) => e.n.toLowerCase() === n)?.e);
}

const processing = (packs: StickerPackDTO[] | undefined) => !!packs?.some((p) => p.stickers.some((s) => !s.url));

/** The packs you have: built-in, official, and the ones you made or saved. */
export function useStickerPacks(enabled = true) {
  return useQuery({
    queryKey: stickerKeys.packs,
    queryFn: async () => unwrap(await six.api.GET("/v1/sticker-packs")).items,
    refetchInterval: (q) => (processing(q.state.data) ? 2000 : false),
    enabled,
  });
}

export async function createStickerPack(qc: QueryClient, title: string) {
  const pack = unwrap(await six.api.POST("/v1/sticker-packs", { body: { title } }));
  void qc.invalidateQueries({ queryKey: stickerKeys.packs });
  return pack;
}

export function useStickerPack(id: string) {
  return useQuery({
    queryKey: stickerKeys.pack(id),
    queryFn: async () => unwrap(await six.api.GET("/v1/sticker-packs/{id}", { params: { path: { id } } })),
    refetchInterval: (q) => (processing(q.state.data && [q.state.data]) ? 2000 : false),
  });
}

function refresh(qc: QueryClient, packId: string) {
  void qc.invalidateQueries({ queryKey: stickerKeys.packs });
  void qc.invalidateQueries({ queryKey: stickerKeys.pack(packId) });
}

/** Browsers don't know .tgs, so the type comes from the extension. */
function stickerMime(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "tgs" ? "application/x-tgsticker" : ext === "json" ? "application/json" : file.type;
}

/** Uploads sticker files into a pack: your own, or an official one when `official` (admins only). */
export async function addStickers(
  qc: QueryClient,
  packId: string,
  files: File[],
  emoji: string,
  official = false,
  onEach?: (done: number) => void,
) {
  try {
    for (const [i, file] of files.entries()) {
      onEach?.(i);
      const upload = await six.upload(file, { kind: "sticker", name: file.name, mime: stickerMime(file) });
      const req = { params: { path: { id: packId } }, body: { uploadId: upload.id, emoji: emoji || (await emojiForFile(file.name)) } };
      unwrap(
        official
          ? await six.api.POST("/v1/admin/sticker-packs/{id}/stickers", req)
          : await six.api.POST("/v1/sticker-packs/{id}/stickers", req),
      );
    }
  } finally {
    refresh(qc, packId);
  }
}

export async function removeSticker(qc: QueryClient, packId: string, stickerId: string) {
  unwrap(
    await six.api.DELETE("/v1/sticker-packs/{id}/stickers/{stickerId}", {
      params: { path: { id: packId, stickerId } },
    }),
  );
  refresh(qc, packId);
}

export async function setPackSaved(qc: QueryClient, packId: string, saved: boolean) {
  const params = { params: { path: { id: packId } } };
  unwrap(
    saved
      ? await six.api.PUT("/v1/sticker-packs/{id}/saved", params)
      : await six.api.DELETE("/v1/sticker-packs/{id}/saved", params),
  );
  refresh(qc, packId);
}
