import { unwrap } from "@six/sdk";
import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { six } from "./six";

/**
 * The sticker zip being uploaded, kept outside the page so switching admin tabs doesn't lose its progress or its
 * error: `progress` runs from 0 to 1 while it uploads.
 */
export const useZipUpload = create<{ name: string | null; size: number; progress: number | null; error: string | null }>(() => ({
  name: null,
  size: 0,
  progress: null,
  error: null,
}));

const stayWarning = (e: BeforeUnloadEvent) => e.preventDefault();

/**
 * Uploads a zip of stickers and starts importing it once it's all there, warning before the page is closed
 * meanwhile, since closing it stops the upload. Returns the import's upload id, or null when it failed.
 */
export async function uploadAndImport(qc: QueryClient, zip: File) {
  useZipUpload.setState({ name: zip.name, size: zip.size, progress: 0, error: null });
  window.addEventListener("beforeunload", stayWarning);
  try {
    const upload = await six.upload(zip, {
      kind: "sticker_zip",
      name: zip.name,
      mime: zip.type || "application/zip",
      onProgress: (progress) => useZipUpload.setState({ progress }),
    });
    unwrap(await six.api.POST("/v1/admin/sticker-packs/import", { body: { uploadId: upload.id } }));
    useZipUpload.setState({ name: null, size: 0, progress: null });
    return upload.id;
  } catch (err) {
    const why = err instanceof Error ? err.message : "the connection dropped";
    useZipUpload.setState({ progress: null, error: `${zip.name} didn't finish uploading: ${why}. Pick it again to retry.` });
    return null;
  } finally {
    window.removeEventListener("beforeunload", stayWarning);
    void qc.invalidateQueries({ queryKey: ["admin", "sticker-import", "latest"] });
  }
}
