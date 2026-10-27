import { unwrap } from "@six/sdk";
import type { StickerPackDTO } from "@six/shared";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { six } from "./six";

export const stickerKeys = {
  packs: ["sticker-packs"] as const,
  pack: (id: string) => ["sticker-pack", id] as const,
};

export const STICKER_ACCEPT = ".tgs,.json,.webp,.png,application/json,image/webp,image/png";

const processing = (packs: StickerPackDTO[] | undefined) => !!packs?.some((p) => p.stickers.some((s) => !s.url));

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
export async function addStickers(qc: QueryClient, packId: string, files: File[], emoji: string, official = false) {
  try {
    for (const file of files) {
      const upload = await six.upload(file, { kind: "sticker", name: file.name, mime: stickerMime(file) });
      const req = { params: { path: { id: packId } }, body: { uploadId: upload.id, emoji } };
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
