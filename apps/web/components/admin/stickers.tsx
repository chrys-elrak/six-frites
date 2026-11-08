"use client";

import { unwrap } from "@six/sdk";
import { STICKER_LIMITS } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminKeys, refreshAdmin } from "@/lib/admin";
import { formatBytes } from "@/lib/format";
import { six } from "@/lib/six";
import { addStickers } from "@/lib/stickers";
import { uploadAndImport, useZipUpload } from "@/lib/zip-import";
import { UploadForm } from "../pack-dialog";
import { Sheet } from "../sheet";
import { StickerView } from "../sticker";

function Importer() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [zip, setZip] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const up = useZipUpload();
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["admin", "sticker-import", importing],
    queryFn: async () =>
      unwrap(await six.api.GET("/v1/admin/sticker-packs/import/{uploadId}", { params: { path: { uploadId: importing! } } })),
    enabled: !!importing,
    refetchInterval: (q) => (q.state.data?.finished ? false : 2000),
  });
  const latest = useQuery({
    queryKey: ["admin", "sticker-import", "latest"],
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/sticker-packs/import")),
    refetchInterval: up.progress !== null ? 15_000 : false,
  });
  const s = status.data ?? latest.data?.import ?? null;
  const running = !!s && !s.finished;
  const busy = up.progress !== null || running;
  const unfinished = (latest.data?.unfinished ?? []).filter((u) => up.progress === null || u.name !== up.name);
  const [now, setNow] = useState(() => Date.now());
  const stuck = running && now - Date.parse(s.updatedAt) > 60_000;

  useEffect(() => {
    const last = latest.data?.import;
    if (last && !last.finished && last.uploadId !== importing) setImporting(last.uploadId);
  }, [latest.data, importing]);

  async function drop(id: string) {
    await six.api.DELETE("/v1/admin/sticker-packs/uploads/{id}", { params: { path: { id } } }).catch(() => null);
    void latest.refetch();
  }

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (s?.finished) refreshAdmin(qc);
    else if (s?.packs.length) void qc.invalidateQueries({ queryKey: adminKeys.officialPacks });
  }, [s?.finished, s?.packs.length, qc]);

  async function cancel() {
    if (!s) return;
    const done = unwrap(await six.api.POST("/v1/admin/sticker-packs/import/{uploadId}/cancel", { params: { path: { uploadId: s.uploadId } } }));
    qc.setQueryData(["admin", "sticker-import", s.uploadId], done);
    refreshAdmin(qc);
  }

  async function run() {
    setError(null);
    try {
      if (!zip) {
        unwrap(await six.api.POST("/v1/admin/sticker-packs", { body: { title: title.trim() } }));
        setTitle("");
        return;
      }
      const id = await uploadAndImport(qc, zip);
      if (id) {
        setImporting(id);
        setZip(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    }
  }

  const pickZip = (file: File | undefined) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return setError("Pick a .zip file");
    setError(null);
    useZipUpload.setState({ error: null });
    setZip(file);
  };

  return (
    <form
      className="space-y-3 rounded-2xl bg-surface backdrop-blur-md p-4 shadow-sm ring-1 ring-surface-line"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <h2 className="font-semibold">New pack</h2>
      <p className="text-sm text-stone-500">
        A name alone makes an empty pack you fill below. Or upload a zip of PNG (animated PNG works), WebP, TGS or Lottie
        JSON files, up to 6 MB each: the server unpacks it, each folder inside becomes an official pack named after it,
        and loose files a pack named after the zip. A file named after an emoji ("Crying Face.png") or starting with one
        ("😢 sad.png") is filed under it; others under ⭐. Over {STICKER_LIMITS.perPack} files in a folder makes several packs.
      </p>
      {!zip && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pack name"
          maxLength={60}
          className="w-full rounded-xl bg-stone-100 px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
        />
      )}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pickZip(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3 py-4 text-sm ${
          over ? "border-brand bg-brand/10" : "border-stone-300 dark:border-stone-700"
        }`}
      >
        <span className="text-stone-500">{zip ? `${zip.name} (${formatBytes(zip.size)})` : "Drop a zip here, or"}</span>
        <span className="font-medium text-brand">{zip ? "Change" : "Choose a zip"}</span>
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            pickZip(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {up.progress !== null && (
        <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(up.progress * 100)} className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
              <div className="h-full rounded-full bg-sky-500 transition-[width] duration-500" style={{ width: `${Math.max(2, up.progress * 100)}%` }} />
            </div>
            <span className="w-11 text-right text-sm font-semibold tabular-nums">{Math.floor(up.progress * 100)}%</span>
          </div>
          <p className="text-sm text-stone-500">
            Uploading {up.name} ({formatBytes(up.size)}). You can switch tabs, but keep this page open until it's up; the import starts then.
          </p>
        </div>
      )}
      {up.error && <p className="text-sm text-red-600 dark:text-red-400">{up.error}</p>}
      {unfinished.length > 0 && (
        <ul className="space-y-1.5">
          {unfinished.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{u.name}</span>
                <span className="text-stone-500">
                  {" "}
                  · {formatBytes(u.size)} · started {new Date(u.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, never finished uploading, so it wasn't imported. Pick it again to retry.
                </span>
              </span>
              <button type="button" onClick={() => void drop(u.id)} className="shrink-0 font-medium text-red-600 hover:underline dark:text-red-400">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {s && running && (
        <div
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={s.total || undefined}
          aria-valuenow={s.total ? s.done : undefined}
          className="flex items-center gap-3"
        >
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${stuck ? "bg-red-500" : "bg-brand"} ${s.total ? "" : "w-1/3 animate-pulse"}`}
              style={s.total ? { width: `${Math.max(2, (s.done / s.total) * 100)}%` } : undefined}
            />
          </div>
          {s.total > 0 && <span className="w-11 text-right text-sm font-semibold tabular-nums">{Math.floor((s.done / s.total) * 100)}%</span>}
        </div>
      )}
      {s && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <p className={stuck ? "text-red-600 dark:text-red-400" : "text-stone-500"}>
            {s.error
              ? `Stopped: ${s.error}${s.packs.length ? ` (made ${s.packs.join(", ")})` : ""}`
              : s.finished
                ? `Done: ${s.total - s.skipped} stickers in ${s.packs.join(", ")}${s.skipped ? ` (${s.skipped} skipped)` : ""}`
                : stuck
                  ? `Nothing has moved for over a minute${s.total ? ` (${s.done}/${s.total})` : ""}: the server's worker may be down. Cancel and try again once it's back.`
                  : s.total
                    ? `Importing ${s.current ?? ""}: ${s.done}/${s.total}`
                    : "Waiting for the server to start the import…"}
          </p>
          {running && (
            <button type="button" onClick={() => void cancel()} className="font-medium text-red-600 hover:underline dark:text-red-400">
              Cancel import
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || (!zip && !title.trim())}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
      >
        {up.progress !== null ? `Uploading ${Math.floor(up.progress * 100)}%` : zip ? "Upload and import" : "Create"}
      </button>
    </form>
  );
}

export function OfficialStickers() {
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const packs = useQuery({
    queryKey: adminKeys.officialPacks,
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/sticker-packs", { params: { query: { official: "true", limit: 50 } } })),
  });

  async function remove(id: string) {
    unwrap(await six.api.DELETE("/v1/admin/sticker-packs/{id}", { params: { path: { id } } }));
    refreshAdmin(qc);
  }

  async function erase(id: string) {
    setFailed(null);
    try {
      unwrap(await six.api.DELETE("/v1/admin/sticker-packs/{id}/forever", { params: { path: { id } } }));
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Couldn't delete the pack");
    }
    refreshAdmin(qc);
  }

  return (
    <div className="space-y-4">
      <Importer />
      {failed && <p className="text-sm text-red-600 dark:text-red-400">{failed}</p>}
      {packs.isPending ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-surface-line rounded-2xl bg-surface backdrop-blur-md shadow-sm ring-1 ring-surface-line">
          {packs.data?.items
            .filter((p) => !p.bannedAt)
            .map((p) => (
              <li key={p.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate font-medium">
                    {p.title} <span className="text-xs text-stone-500">{p.stickers.length} stickers</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setRemoving({ id: p.id, title: p.title })}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {p.stickers.slice(0, 12).map((s) => (
                    <StickerView key={s.id} sticker={s} size={48} still />
                  ))}
                </div>
                {p.stickers.length < STICKER_LIMITS.perPack && (
                  <div className="-mx-4">
                    <UploadForm
                      withTitle={false}
                      label="Add stickers"
                      onSubmit={async (_, files, emoji) => {
                        await addStickers(qc, p.id, files, emoji, true);
                        refreshAdmin(qc);
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          {!packs.data?.items.some((p) => !p.bannedAt) && (
            <li className="py-12 text-center text-sm text-stone-500">No official packs yet, besides the built-in Noto ones.</li>
          )}
        </ul>
      )}
      {removing && (
        <Sheet
          title={`Remove "${removing.title}"?`}
          actions={[
            { label: "Delete it for good (only if never sent)", destructive: true, onSelect: () => void erase(removing.id) },
            { label: "Take it down, keep it in chats", destructive: true, onSelect: () => void remove(removing.id) },
          ]}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
