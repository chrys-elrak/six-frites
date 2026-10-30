import { afterEach, describe, expect, it, vi } from "vitest";
import type { RestClient } from "../src/rest.js";
import { uploadFile } from "../src/uploads.js";

/** Stands in for XMLHttpRequest: answers each PUT on the next tick, failing a URL as many times as asked. */
function fakeStorage(failures: Record<string, number> = {}) {
  const stored: Record<string, Blob> = {};
  let inFlight = 0;
  let maxInFlight = 0;
  class FakeXhr {
    upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    status = 0;
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    private url = "";
    private aborted = false;
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader() {}
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    send(body: Blob) {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      setTimeout(() => {
        inFlight--;
        if (this.aborted) return;
        if (failures[this.url]) {
          failures[this.url]!--;
          return this.onerror?.();
        }
        stored[this.url] = body;
        this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
        this.status = 200;
        this.onload?.();
      });
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  return { stored, maxInFlight: () => maxInFlight };
}

function fakeApi(partCount: number, partSize: number) {
  const calls: string[] = [];
  const parts = Array.from({ length: partCount }, (_, i) => `https://storage.test/part${i + 1}`);
  const client = {
    POST: async (path: string) => {
      calls.push(path);
      const data = path.endsWith("/presign") ? { upload: { id: "u1" }, parts, partSize, headers: {} } : { id: "u1", status: "ready" };
      return { data, response: new Response(null, { status: 200 }) };
    },
  } as unknown as RestClient;
  return { client, calls, parts };
}

const fileOf = (size: number) => new Blob([Uint8Array.from({ length: size }, (_, i) => i % 251)]);
const opts = { kind: "file" as const, name: "big.zip", mime: "application/zip" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadFile in parts", () => {
  it("sends four parts at a time, retries one that fails, and the parts add up to the file", async () => {
    const file = fileOf(50);
    const { client, calls, parts } = fakeApi(10, 5);
    const storage = fakeStorage({ [parts[2]!]: 2 });
    const progress: number[] = [];

    await uploadFile(client, file, { ...opts, onProgress: (f) => progress.push(f) });

    expect(storage.maxInFlight()).toBe(4);
    const joined = new Blob(parts.map((url) => storage.stored[url]!));
    expect(new Uint8Array(await joined.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(progress.at(-1)).toBe(1);
    expect(calls).toEqual(["/v1/uploads/presign", "/v1/uploads/{id}/complete"]);
  });

  it("gives up after a part fails three times, cancels the rest and never completes", async () => {
    const { client, calls, parts } = fakeApi(40, 5);
    const storage = fakeStorage({ [parts[1]!]: 3 });

    await expect(uploadFile(client, fileOf(200), opts)).rejects.toMatchObject({ code: "UPLOAD_FAILED" });

    expect(Object.keys(storage.stored).length).toBeLessThan(20);
    expect(calls).toEqual(["/v1/uploads/presign"]);
  });
});
