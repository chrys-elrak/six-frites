"use client";

import { unwrap } from "@six/sdk";
import type { AttachmentDTO, ReportDTO, ReportedMessageDTO, ResolveReportInput } from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminKeys, reasonLabel, refreshAdmin } from "@/lib/admin";
import { clockTime, timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Avatar } from "../avatar";
import { Sheet, type SheetAction } from "../sheet";
import { StickerView } from "../sticker";
import { Segmented } from "./segmented";

function Media({ a }: { a: AttachmentDTO }) {
  if (!a.url) return <p className="text-sm text-stone-500 italic">{a.name} (file no longer available)</p>;
  if (a.kind === "image") {
    return (
      <a href={a.url} target="_blank" rel="noreferrer">
        <img src={a.thumbUrl ?? a.url} alt="" className="max-h-48 rounded-lg" />
      </a>
    );
  }
  if (a.kind === "video" || a.kind === "video_note" || a.kind === "gif") {
    return (
      <video src={a.url} controls muted={a.kind === "gif"} loop={a.kind === "gif"} className="max-h-48 rounded-lg" />
    );
  }
  if (a.kind === "voice") return <audio src={a.url} controls className="w-full max-w-xs" />;
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="text-sm underline">
      {a.name}
    </a>
  );
}

function Excerpt({ m, name }: { m: ReportedMessageDTO; name: string }) {
  const empty = !m.text && !m.attachment && !m.sticker;
  return (
    <div
      className={`space-y-1.5 rounded-xl px-3 py-2 ${
        m.reported ? "bg-red-50 ring-2 ring-red-500/50 dark:bg-red-950/40" : "bg-stone-100 dark:bg-stone-800"
      }`}
    >
      <p className="text-xs font-semibold">
        {name} <span className="font-normal text-stone-500">· {clockTime(m.createdAt)}</span>
        {m.reported && <span className="ml-1.5 text-red-600 dark:text-red-400">Reported</span>}
      </p>
      {m.sticker && <StickerView sticker={m.sticker} size={96} />}
      {m.attachment && <Media a={m.attachment} />}
      {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
      {empty && (
        <p className="text-sm text-stone-500 italic">
          {m.type === "service" ? "Changed the chat settings" : "No content (deleted or self-destructed)"}
        </p>
      )}
    </div>
  );
}

function Person({ label, user }: { label: string; user: ReportDTO["reporter"] }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar user={user} />
      <div className="min-w-0">
        <p className="text-xs text-stone-500">{label}</p>
        <p className="truncate text-sm font-medium">
          {user.displayName}
          {user.bannedAt && <span className="ml-1.5 text-xs text-red-600 dark:text-red-400">Banned</span>}
        </p>
        <p className="truncate text-xs text-stone-500">{user.email}</p>
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: ReportDTO }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<SheetAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = new Map([
    [report.reporter.id, report.reporter.displayName],
    [report.target.id, report.target.displayName],
  ]);
  const hasMessage = report.messages.some((m) => m.reported);

  async function resolve(input: ResolveReportInput) {
    setError(null);
    try {
      unwrap(
        await six.api.POST("/v1/admin/reports/{id}/resolve", { params: { path: { id: report.id } }, body: input }),
      );
      refreshAdmin(qc);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const ask = (label: string, input: ResolveReportInput) =>
    setConfirm([{ label, destructive: true, onSelect: () => void resolve(input) }]);

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
          {reasonLabel(report.reason)}
        </span>
        <span className="text-xs text-stone-500">{timeAgo(report.createdAt)}</span>
        {report.status !== "open" && (
          <span className="ml-auto text-xs text-stone-500">
            {report.status === "actioned" ? "Actioned" : "Dismissed"}
            {report.resolution && ` · ${report.resolution}`}
          </span>
        )}
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Person label="Reported" user={report.target} />
        <Person label="By" user={report.reporter} />
      </div>
      {report.note && <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm dark:bg-stone-800/60">“{report.note}”</p>}
      {report.messages.length > 0 && (
        <div className="space-y-1.5">
          {report.messages.map((m) => (
            <Excerpt key={m.id} m={m} name={names.get(m.senderId) ?? "Someone"} />
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {report.status === "open" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void resolve({})}
            className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            Dismiss
          </button>
          {hasMessage && (
            <button
              type="button"
              onClick={() => ask("Delete the message for everyone", { deleteMessage: true })}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 dark:text-red-400 dark:ring-red-900 dark:hover:bg-red-950"
            >
              Delete message
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              ask(`Ban ${report.target.displayName}${hasMessage ? " and delete the message" : ""}`, {
                banUser: true,
                deleteMessage: hasMessage,
              })
            }
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Ban {report.target.displayName}
          </button>
        </div>
      )}
      {confirm && <Sheet title="Are you sure?" actions={confirm} onClose={() => setConfirm(null)} />}
    </article>
  );
}

export function Reports() {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const reports = useInfiniteQuery({
    queryKey: adminKeys.reports(status),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/admin/reports", { params: { query: { status, cursor: pageParam, limit: 20 } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = reports.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { value: "open", label: "Open" },
          { value: "resolved", label: "Handled" },
        ]}
      />
      {reports.isPending ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-500">
          {status === "open" ? "No open reports. All quiet." : "Nothing handled yet."}
        </p>
      ) : (
        items.map((r) => <ReportCard key={r.id} report={r} />)
      )}
      {reports.hasNextPage && (
        <button
          type="button"
          onClick={() => void reports.fetchNextPage()}
          disabled={reports.isFetchingNextPage}
          className="w-full rounded-xl py-2.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-800 dark:hover:bg-stone-900"
        >
          {reports.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
