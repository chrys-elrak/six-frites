"use client";

import { unwrap } from "@six/sdk";
import type { AdminStatsDTO } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import { adminKeys } from "@/lib/admin";
import { six } from "@/lib/six";

const dayFormat = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</p>
      {note && <p className="mt-0.5 text-xs text-stone-500">{note}</p>}
    </div>
  );
}

function SignupsChart({ data }: { data: AdminStatsDTO["signups"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Sign-ups, last 30 days</span>
        <span className="text-sm text-stone-500 tabular-nums">{total.toLocaleString()} total</span>
      </figcaption>
      <div className="relative mt-4">
        <span className="absolute -top-4 left-0 text-[11px] text-stone-400 tabular-nums">{max}</span>
        <div aria-hidden className="flex h-36 items-end gap-[2px] border-b border-stone-200 dark:border-stone-700">
          {data.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-stone-900 px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block dark:bg-stone-100 dark:text-stone-900">
                {dayFormat(d.day)}: {d.count}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-stone-500">
        <span>{data[0] && dayFormat(data[0].day)}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Sign-ups per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{dayFormat(d.day)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Overview() {
  const stats = useQuery({
    queryKey: adminKeys.stats,
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/stats")),
  });
  const s = stats.data;
  if (!s)
    return <p className="py-12 text-center text-sm text-stone-500">{stats.isError ? "Couldn't load." : "Loading…"}</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="People" value={s.users} note={`${s.bannedUsers.toLocaleString()} banned`} />
        <Tile label="Active this week" value={s.activeUsers7d} />
        <Tile label="Messages" value={s.messages} note={`${s.messages24h.toLocaleString()} in the last day`} />
        <Tile label="Open reports" value={s.openReports} note={`${s.stickerPacks.toLocaleString()} sticker packs`} />
      </div>
      <SignupsChart data={s.signups} />
    </div>
  );
}
