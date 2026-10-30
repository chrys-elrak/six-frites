import { type AttachmentDTO, ENCRYPTED_MIME, type UploadKind } from "@six/shared";
import { SixApiError, unwrap } from "./errors.js";
import type { RestClient } from "./rest.js";

export interface UploadOptions {
  kind: UploadKind;
  name: string;
  mime: string;
  /** The body is already encrypted (see encryptFile): name and type stay out of the server's view. */
  encrypted?: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function put(url: string, body: Blob, headers: Record<string, string>, opts: UploadOptions) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new SixApiError(xhr.status, "UPLOAD_FAILED", "Storage rejected the upload"));
    xhr.onerror = () => reject(new SixApiError(0, "UPLOAD_FAILED", "Network error while uploading"));
    xhr.onabort = () => reject(new SixApiError(0, "UPLOAD_ABORTED", "Upload cancelled"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

const PARALLEL_PARTS = 4;

/**
 * Sends the parts a few at a time, which keeps a slow, distant line busy. A part that fails is tried
 * twice more; if it still fails, the parts in flight are cancelled and the upload fails.
 */
async function putParts(urls: string[], partSize: number, body: Blob, headers: Record<string, string>, opts: UploadOptions) {
  const stop = new AbortController();
  opts.signal?.addEventListener("abort", () => stop.abort(), { once: true });
  const sent = urls.map(() => 0);
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !stop.signal.aborted) {
      const i = next++;
      const part = body.slice(i * partSize, (i + 1) * partSize);
      const onProgress = (fraction: number) => {
        sent[i] = fraction * part.size;
        opts.onProgress?.(sent.reduce((a, b) => a + b) / body.size);
      };
      for (let attempt = 1; ; attempt++) {
        try {
          await put(urls[i]!, part, headers, { ...opts, signal: stop.signal, onProgress });
          break;
        } catch (err) {
          if (attempt === 3 || stop.signal.aborted) throw err;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_PARTS }, worker)).catch((err) => {
    stop.abort();
    throw err;
  });
}

/** Uploads a file straight to storage and confirms it, returning the attachment to send with a message. */
export async function uploadFile(api: RestClient, body: Blob, opts: UploadOptions): Promise<AttachmentDTO> {
  const presigned = unwrap(
    await api.POST("/v1/uploads/presign", {
      body: {
        ...(opts.encrypted
          ? { kind: opts.kind, name: "encrypted", mime: ENCRYPTED_MIME, size: body.size, encrypted: true }
          : { kind: opts.kind, name: opts.name, mime: opts.mime, size: body.size }),
        multipart: true,
      },
    }),
  );
  if (presigned.parts) await putParts(presigned.parts, presigned.partSize!, body, presigned.headers, opts);
  else await put(presigned.url!, body, presigned.headers, opts);
  opts.onProgress?.(1);
  return unwrap(await api.POST("/v1/uploads/{id}/complete", { params: { path: { id: presigned.upload.id } } }));
}

/** Picks the upload kind a file should be sent as. */
export function kindFor(mime: string): UploadKind {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(base)) return "image";
  if (base.startsWith("video/")) return "video";
  return "file";
}
