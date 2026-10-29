"use client";

import { unwrap } from "@six/sdk";
import type { AdminLargeFileDTO } from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminKeys, refreshAdmin } from "@/lib/admin";
import { formatBytes, timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Sheet } from "../sheet";

const LABELS: Partial<Record<AdminLargeFileDTO["status"], string>> = {
  pending: "Uploading",
  processing: "Processing",
  failed: "Failed",
  removed: "Removed",
};

function FileRow({ file }: { file: AdminLargeFileDTO }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const removable = file.status === "ready" || file.status === "failed";

  async function remove() {
    unwrap(await six.api.DELETE("/v1/admin/large-files/{id}", { params: { path: { id: file.id } } }));
    refreshAdmin(qc);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {file.name}
          {LABELS[file.status] && (
            <span
              className={`ml-1.5 text-xs ${
                file.status === "removed" ? "text-red-600 dark:text-red-400" : "text-stone-500"
              }`}
            >
              {LABELS[file.status]}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-stone-500">
          {formatBytes(file.size)} · {file.kind} · {file.owner.displayName} · {file.owner.email} ·{" "}
          {timeAgo(file.createdAt)}
        </p>
      </div>
      {removable && (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Remove
        </button>
      )}
      {confirm && (
        <Sheet
          title={`Remove "${file.name}"?`}
          actions={[{ label: "Delete it from storage", destructive: true, onSelect: () => void remove() }]}
          onClose={() => setConfirm(false)}
        />
      )}
    </li>
  );
}

export function LargeFiles() {
  const files = useInfiniteQuery({
    queryKey: adminKeys.largeFiles,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/admin/large-files", { params: { query: { cursor: pageParam, limit: 30 } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = files.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Files over 100 MB are sent unencrypted. Removing one deletes it from storage; the chat shows "File too large,
        removed" in its place.
      </p>
      {files.isPending ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-500">Nobody has sent a file over 100 MB yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
          {items.map((f) => (
            <FileRow key={f.id} file={f} />
          ))}
        </ul>
      )}
      {files.hasNextPage && (
        <button
          type="button"
          onClick={() => void files.fetchNextPage()}
          disabled={files.isFetchingNextPage}
          className="w-full rounded-xl py-2.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-800 dark:hover:bg-stone-900"
        >
          {files.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
