"use client";

import { unwrap } from "@six/sdk";
import type { AdminUserDTO } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { six } from "@/lib/six";
import { Dialog } from "../dialog";
import { Segmented } from "./segmented";

const RANGES = ["7", "30", "90"] as const;

function spent(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const dayName = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Bars({ bars, labels }: { bars: { value: number; tip: string }[]; labels: string[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div>
      <div className="flex h-24 items-end gap-[2px] border-b border-stone-300 dark:border-stone-700">
        {bars.map((b, i) => (
          <div key={i} title={b.tip} aria-label={b.tip} className="flex h-full flex-1 items-end hover:bg-stone-900/5 dark:hover:bg-white/5">
            <div className="w-full rounded-t-[4px] bg-brand" style={{ height: b.value ? `max(2px, ${(b.value / max) * 100}%)` : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-stone-500">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Ranked({ rows }: { rows: { name: string; value: number; label: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-stone-500">Nothing yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.name} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-xs">{r.name}</span>
            <span className="shrink-0 tabular-nums text-stone-600 dark:text-stone-300">{r.label}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-stone-200 dark:bg-stone-800">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function UsageDialog({ user, onClose }: { user: AdminUserDTO; onClose: () => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("30");
  const usage = useQuery({
    queryKey: ["admin", "usage", user.id, range],
    queryFn: async () =>
      unwrap(await six.api.GET("/v1/admin/users/{id}/usage", { params: { path: { id: user.id }, query: { days: Number(range) } } })),
  });
  const u = usage.data;
  const total = u?.days.reduce((s, d) => s + d.seconds, 0) ?? 0;
  const calls = u?.days.reduce((s, d) => s + d.calls, 0) ?? 0;
  const activeDays = u?.days.filter((d) => d.seconds > 0).length ?? 0;
  const offset = -new Date().getTimezoneOffset() / 60;
  const localHours = u ? Array.from({ length: 24 }, (_, h) => u.hours[(((h - offset) % 24) + 24) % 24] ?? 0) : [];

  return (
    <Dialog onClose={onClose}>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate font-semibold">Usage of {user.displayName}</h2>
          <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: `${r}d` }))} />
        </div>
        {usage.isPending && <p className="text-sm text-stone-500">Loading…</p>}
        {usage.error && <p className="text-sm text-red-600 dark:text-red-400">{usage.error.message}</p>}
        {u && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Time in the app" value={spent(total)} />
              <Stat label="Per active day" value={activeDays ? spent(Math.round(total / activeDays)) : "—"} />
              <Stat label="API calls" value={calls.toLocaleString()} />
              <Stat label="Storage" value={formatBytes(user.storageBytes)} />
            </div>
            <section className="space-y-1.5">
              <h3 className="text-sm font-medium">Time in the app per day</h3>
              <Bars
                bars={u.days.map((d) => ({
                  value: d.seconds,
                  tip: `${dayName(d.day)}: ${spent(d.seconds)}, ${d.calls.toLocaleString()} calls`,
                }))}
                labels={[dayName(u.days[0]!.day), dayName(u.days.at(-1)!.day)]}
              />
            </section>
            <section className="space-y-1.5">
              <h3 className="text-sm font-medium">When they use it (your time)</h3>
              <Bars bars={localHours.map((s, h) => ({ value: s, tip: `${h}:00–${h + 1}:00: ${spent(s)}` }))} labels={["0h", "6h", "12h", "18h", "24h"]} />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Screens</h3>
              <Ranked rows={u.pages.map((p) => ({ name: p.page, value: p.seconds, label: spent(p.seconds) }))} />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">API calls</h3>
              <Ranked rows={u.calls.map((c) => ({ name: c.name, value: c.count, label: c.count.toLocaleString() }))} />
            </section>
            <p className="text-xs text-stone-500">
              Time counts while the app is open and visible, on every device together. Kept 90 days. Google Maps:{" "}
              {user.mapsUsed} calls this month.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
