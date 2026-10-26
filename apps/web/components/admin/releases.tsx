"use client";

import { unwrap } from "@six/sdk";
import { APK_MIME, type AppReleaseDTO, MAX_APK_BYTES } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useState } from "react";
import { adminKeys } from "@/lib/admin";
import { androidAppKey } from "@/lib/android-app";
import { formatBytes, timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Sheet } from "../sheet";

function putFile(url: string, file: File, headers: Record<string, string>, onProgress: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Storage rejected the file")));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
}

function UploadRelease() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setError(null);
    if (f && f.size > MAX_APK_BYTES) {
      setError(`The APK is bigger than ${formatBytes(MAX_APK_BYTES)}.`);
      return;
    }
    setFile(f);
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !version.trim()) return;
    setError(null);
    setProgress(0);
    let id: string | null = null;
    try {
      const created = unwrap(
        await six.api.POST("/v1/admin/releases", {
          body: { version: version.trim(), notes: notes.trim() || undefined, size: file.size },
        }),
      );
      id = created.release.id;
      await putFile(created.url, file, created.headers, setProgress);
      unwrap(await six.api.POST("/v1/admin/releases/{id}/publish", { params: { path: { id } } }));
      setFile(null);
      setVersion("");
      setNotes("");
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError((err as Error).message || "Couldn't publish the release.");
      if (id) await six.api.DELETE("/v1/admin/releases/{id}", { params: { path: { id } } }).catch(() => null);
    } finally {
      setProgress(null);
      void qc.invalidateQueries({ queryKey: adminKeys.releases });
      void qc.invalidateQueries({ queryKey: androidAppKey });
    }
  }

  const busy = progress !== null;
  const field =
    "w-full rounded-xl bg-stone-100 px-3 py-2 text-sm outline-none ring-brand focus:ring-2 dark:bg-stone-800";

  return (
    <form
      onSubmit={publish}
      className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
    >
      <h2 className="font-medium">Publish a new version</h2>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-stone-300 px-4 py-5 text-sm text-stone-500 hover:border-brand dark:border-stone-700">
        <Upload className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {file ? `${file.name} · ${formatBytes(file.size)}` : "Choose the APK file"}
        </span>
        <input
          type="file"
          accept={`${APK_MIME},.apk`}
          className="sr-only"
          disabled={busy}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </label>
      <input
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder="Version, e.g. 1.2.0"
        maxLength={40}
        disabled={busy}
        className={field}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What's new (optional)"
        maxLength={2000}
        rows={3}
        disabled={busy}
        className={field}
      />
      {busy && (
        <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={!file || !version.trim() || busy}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
      >
        {busy ? `Uploading ${Math.round(progress * 100)}%` : "Upload and publish"}
      </button>
    </form>
  );
}

function ReleaseRow({ release, latest }: { release: AppReleaseDTO; latest: boolean }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  async function remove() {
    unwrap(await six.api.DELETE("/v1/admin/releases/{id}", { params: { path: { id: release.id } } }));
    void qc.invalidateQueries({ queryKey: adminKeys.releases });
    void qc.invalidateQueries({ queryKey: androidAppKey });
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {release.version}
          {latest && <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">Latest</span>}
          {!release.published && <span className="ml-2 text-xs text-stone-500">Not uploaded</span>}
        </p>
        <p className="text-xs text-stone-500">
          {formatBytes(release.size)} · {timeAgo(release.createdAt)}
        </p>
        {release.notes && <p className="mt-1 text-sm whitespace-pre-line text-stone-600 dark:text-stone-300">{release.notes}</p>}
      </div>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete
      </button>
      {confirm && (
        <Sheet
          title={`Delete version ${release.version}?${latest ? " The download link will offer the previous version." : ""}`}
          actions={[{ label: "Delete this version", destructive: true, onSelect: () => void remove() }]}
          onClose={() => setConfirm(false)}
        />
      )}
    </li>
  );
}

export function Releases() {
  const releases = useQuery({
    queryKey: adminKeys.releases,
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/releases")),
  });
  const latestId = releases.data?.find((r) => r.published)?.id;

  return (
    <div className="space-y-5">
      <UploadRelease />
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-stone-500">Versions</h2>
        {releases.isPending ? (
          <p className="px-1 text-sm text-stone-500">Loading…</p>
        ) : !releases.data?.length ? (
          <p className="px-1 text-sm text-stone-500">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
            {releases.data.map((r) => (
              <ReleaseRow key={r.id} release={r} latest={r.id === latestId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
