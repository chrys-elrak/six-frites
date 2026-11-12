"use client";

import { unwrap } from "@six/sdk";
import { type AdminUserDTO, type BanScope, askUrl } from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BAN_LENGTHS, BAN_SCOPES, adminKeys, banEnd, refreshAdmin } from "@/lib/admin";
import { formatBytes, timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Avatar } from "../avatar";
import { Dialog } from "../dialog";
import { Sheet } from "../sheet";
import { PrimaryButton } from "../ui";
import { Segmented } from "./segmented";
import { UsageDialog } from "./usage";

function LimitDialog({ user, onClose }: { user: AdminUserDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(String(user.inviteLimit));
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            unwrap(
              await six.api.POST("/v1/admin/users/{id}/invite-limit", {
                params: { path: { id: user.id } },
                body: { limit: Number(limit) },
              }),
            );
            refreshAdmin(qc);
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        className="space-y-3 p-4"
      >
        <h2 className="font-semibold">Invite limit for {user.displayName}</h2>
        <p className="text-sm text-stone-500">
          {user.invited} joined with their links{user.waiting > 0 && `, ${user.waiting} waiting`}. Raising the limit
          lets the people waiting in, oldest first.
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100000}
          required
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          autoFocus
          aria-label="Invite limit"
          className="block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <PrimaryButton type="submit" className="flex-1">
            Save
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

function CapDialog({
  title,
  about,
  unit,
  current,
  save,
  onClose,
}: {
  title: string;
  about: string;
  unit: string;
  current: number | null;
  save: (limit: number | null) => Promise<unknown>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);

  async function submit(value: number | null) {
    try {
      await save(value);
      refreshAdmin(qc);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(Number(limit));
        }}
        className="space-y-3 p-4"
      >
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-stone-500">{about}</p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            required
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            autoFocus
            aria-label={`${title} (${unit})`}
            className="block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
          />
          <span className="shrink-0 font-medium">{unit}</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          {current !== null && (
            <button
              type="button"
              onClick={() => void submit(null)}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              Remove limit
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <PrimaryButton type="submit" className="flex-1">
            Save
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

function BanDialog({ user, onClose }: { user: AdminUserDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState<number | undefined>(24);
  const [scope, setScope] = useState<BanScope>("full");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            unwrap(
              await six.api.POST("/v1/admin/users/{id}/ban", {
                params: { path: { id: user.id } },
                body: { reason: reason.trim(), hours, scope },
              }),
            );
            refreshAdmin(qc);
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        className="space-y-3 p-4"
      >
        <h2 className="font-semibold">Ban {user.displayName}?</h2>
        <p className="text-sm text-stone-500">
          {scope === "full"
            ? "They are signed out everywhere and can't sign in again until the ban ends or you lift it, on this account or another on the same phone or browser."
            : "They can still sign in, but only to their anonymous messages and support, like a guest, until the ban ends or you lift it."}{" "}
          Their messages stay.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <span className="font-medium">What</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as BanScope)}
            className="flex-1 rounded-xl bg-stone-100 px-3 py-2.5 dark:bg-stone-800"
          >
            {BAN_SCOPES.map((s) => (
              <option key={s.scope} value={s.scope}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <span className="font-medium">How long</span>
          <select
            value={hours ?? ""}
            onChange={(e) => setHours(e.target.value ? Number(e.target.value) : undefined)}
            className="flex-1 rounded-xl bg-stone-100 px-3 py-2.5 dark:bg-stone-800"
          >
            {BAN_LENGTHS.map((l) => (
              <option key={l.label} value={l.hours ?? ""}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={500}
          rows={2}
          autoFocus
          placeholder="Reason (only admins see it)"
          aria-label="Reason"
          className="block w-full resize-none rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!reason.trim()}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
          >
            Ban
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const TONES = {
  brand: "bg-brand/15 text-brand",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const PROVIDER_NAMES: Record<AdminUserDTO["providers"][number], string> = { google: "Google", facebook: "Facebook", apple: "Apple" };

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

/** One number about a person, with a bar towards their limit when they have one. */
function Stat({
  label,
  value,
  used = 0,
  limit = null,
  full = "red",
  className = "",
}: {
  label: string;
  value: string;
  used?: number;
  limit?: number | null;
  full?: "red" | "amber";
  className?: string;
}) {
  const over = limit !== null && used >= limit;
  const warn = full === "red" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div className={`min-w-0 rounded-xl bg-stone-900/[0.04] px-3 py-2 dark:bg-white/5 ${className}`}>
      <p className="text-[11px] font-medium text-stone-500">{label}</p>
      <p className={`truncate text-sm font-semibold tabular-nums ${over ? warn : ""}`}>{value}</p>
      {limit !== null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-stone-900/10 dark:bg-white/10">
          <div
            className={`h-full rounded-full ${over ? (full === "red" ? "bg-red-500" : "bg-amber-500") : "bg-brand"}`}
            style={{ width: `${limit > 0 ? Math.min(100, (used / limit) * 100) : 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function UserRow({ u, checked, onCheck }: { u: AdminUserDTO; checked: boolean; onCheck: (on: boolean) => void }) {
  const qc = useQueryClient();
  const [banning, setBanning] = useState(false);
  const [limiting, setLimiting] = useState(false);
  const [capping, setCapping] = useState<"storage" | "maps" | "usage" | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [granting, setGranting] = useState(false);
  const [menu, setMenu] = useState(false);

  async function act(path: "/v1/admin/users/{id}/unban" | "/v1/admin/users/{id}/sign-out" | "/v1/admin/users/{id}/full-access") {
    unwrap(await six.api.POST(path, { params: { path: { id: u.id } } }));
    refreshAdmin(qc);
  }

  const actions = [
    { label: "Invite limit", onSelect: () => setLimiting(true) },
    { label: "Usage", onSelect: () => setCapping("usage") },
    { label: "Storage limit", onSelect: () => setCapping("storage") },
    { label: "Maps limit", onSelect: () => setCapping("maps") },
    ...(u.activeSessions > 0 ? [{ label: "Sign out", onSelect: () => setSigningOut(true) }] : []),
    u.bannedAt
      ? { label: "Lift ban", onSelect: () => void act("/v1/admin/users/{id}/unban") }
      : { label: "Ban", destructive: true, onSelect: () => setBanning(true) },
  ];
  const mb = 1024 * 1024;

  return (
    <li className={`rounded-2xl bg-surface p-4 shadow-sm ring-1 backdrop-blur-md ${checked ? "ring-2 ring-brand" : "ring-surface-line"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={`Select ${u.displayName}`}
          className="mt-3.5 size-4 shrink-0 accent-brand"
        />
        <Avatar user={u} size="md" online={u.online} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate font-semibold">{u.displayName}</span>
            {u.admin ? (
              <Badge tone="brand">Admin</Badge>
            ) : u.guest || (u.bannedAt && u.banScope === "chat") ? (
              <Badge tone="amber">Anonymous only</Badge>
            ) : (
              <Badge tone="green">Full access</Badge>
            )}
            {u.bannedAt && (
              <Badge tone="red">
                {u.banScope === "chat" ? "Banned from chats" : "Banned"}
                {u.bannedUntil && ` until ${banEnd(u.bannedUntil)}`}
              </Badge>
            )}
            {u.queued && <Badge tone="amber">Waiting</Badge>}
            {!u.ads && <Badge tone="green">No ads</Badge>}
          </p>
          <p className="truncate text-sm text-stone-500">
            {u.email}
            {u.providers.length > 0 && ` · via ${u.providers.map((p) => PROVIDER_NAMES[p]).join(", ")}`}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-stone-500">
            {u.online ? (
              <span className="flex items-center gap-1 font-medium text-green-600 dark:text-green-400">
                <span className="size-1.5 rounded-full bg-current" />
                Online on {u.devices.map((d) => d.replace("_", " on ")).join(", ")}
              </span>
            ) : (
              <span>{u.lastActiveAt ? `Active ${timeAgo(u.lastActiveAt)}` : "Signed out"}</span>
            )}
            <span aria-hidden>·</span>
            <span>Joined {timeAgo(u.createdAt)}</span>
            <span aria-hidden>·</span>
            <a
              href={askUrl(window.location.origin, u.askCode)}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand hover:underline"
            >
              Anonymous link
            </a>
          </p>
        </div>
        {!u.admin && (
          <div className="flex shrink-0 items-center gap-1.5">
            {(u.guest || u.queued) && (
              <button
                type="button"
                onClick={() => setGranting(true)}
                className="hidden rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 sm:block"
              >
                Give full access
              </button>
            )}
            <button
              type="button"
              onClick={() => setMenu(true)}
              aria-label={`Actions for ${u.displayName}`}
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-900/5 dark:hover:bg-white/10"
            >
              <MoreHorizontal className="size-5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-5">
        <Stat label="Chats" value={String(u.chats)} className="col-span-2 sm:col-span-1" />
        <Stat label="Messages" value={String(u.messages)} className="col-span-2 sm:col-span-1" />
        <Stat
          label="Invited"
          value={u.admin ? String(u.invited) : `${u.invited} / ${u.inviteLimit}`}
          used={u.invited}
          limit={u.admin ? null : u.inviteLimit}
          full="amber"
          className="col-span-2 sm:col-span-1"
        />
        <Stat
          label="Storage"
          value={u.storageLimitMb === null ? formatBytes(u.storageBytes) : `${formatBytes(u.storageBytes)} / ${formatBytes(u.storageLimitMb * mb)}`}
          used={u.storageBytes}
          limit={u.storageLimitMb === null ? null : u.storageLimitMb * mb}
          className="col-span-3 sm:col-span-1"
        />
        <Stat
          label="Maps calls"
          value={u.mapsLimit === null ? String(u.mapsUsed) : `${u.mapsUsed} / ${u.mapsLimit}`}
          used={u.mapsUsed}
          limit={u.mapsLimit}
          className="col-span-3 sm:col-span-1"
        />
      </div>

      {(u.waiting > 0 || u.openReports > 0 || u.banReason || u.seenBy || ((u.guest || u.queued) && !u.admin)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {(u.guest || u.queued) && !u.admin && (
            <button
              type="button"
              onClick={() => setGranting(true)}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 sm:hidden"
            >
              Give full access
            </button>
          )}
          {u.waiting > 0 && <Badge tone="amber">{u.waiting} waiting for a place</Badge>}
          {u.openReports > 0 && (
            <Badge tone="red">
              {u.openReports} open report{u.openReports === 1 ? "" : "s"}
            </Badge>
          )}
          {u.banReason && <p className="w-full rounded-xl bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">Ban reason: {u.banReason}</p>}
          {u.seenBy && (
            <p className="w-full rounded-xl bg-brand/10 px-3 py-2 text-brand">
              Seen under this alias by {u.seenBy.map((v) => `${v.displayName} (${v.email})`).join(", ")}
            </p>
          )}
        </div>
      )}

      {menu && <Sheet title={u.displayName} onClose={() => setMenu(false)} actions={actions} />}
      {banning && <BanDialog user={u} onClose={() => setBanning(false)} />}
      {limiting && <LimitDialog user={u} onClose={() => setLimiting(false)} />}
      {capping === "usage" && <UsageDialog user={u} onClose={() => setCapping(null)} />}
      {capping === "storage" && (
        <CapDialog
          title={`Storage limit for ${u.displayName}`}
          about={`They use ${formatBytes(u.storageBytes)}. Once full they can only send text, GIFs and stickers, and are asked to contact support or delete their files.`}
          unit="MB"
          current={u.storageLimitMb}
          save={async (limitMb) =>
            unwrap(await six.api.POST("/v1/admin/users/{id}/storage-limit", { params: { path: { id: u.id } }, body: { limitMb } }))
          }
          onClose={() => setCapping(null)}
        />
      )}
      {capping === "maps" && (
        <CapDialog
          title={`Google Maps limit for ${u.displayName}`}
          about={`They made ${u.mapsUsed} calls to Google Maps this month. Past the limit, place search, map pictures and the map picker use OpenStreetMap instead. 0 keeps them on OpenStreetMap.`}
          unit="calls / month"
          current={u.mapsLimit}
          save={async (limit) =>
            unwrap(await six.api.POST("/v1/admin/users/{id}/maps-limit", { params: { path: { id: u.id } }, body: { limit } }))
          }
          onClose={() => setCapping(null)}
        />
      )}
      {granting && (
        <Sheet
          title={`Give ${u.displayName} full access? They'll get a notification and an email.`}
          onClose={() => setGranting(false)}
          actions={[{ label: "Give full access", onSelect: () => void act("/v1/admin/users/{id}/full-access") }]}
        />
      )}
      {signingOut && (
        <Sheet
          title={`Sign ${u.displayName} out of ${u.activeSessions} device${u.activeSessions === 1 ? "" : "s"}?`}
          onClose={() => setSigningOut(false)}
          actions={[
            {
              label: "Sign out everywhere",
              destructive: true,
              onSelect: () => void act("/v1/admin/users/{id}/sign-out"),
            },
          ]}
        />
      )}
    </li>
  );
}

export function Users() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "banned">("all");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const users = useInfiniteQuery({
    queryKey: adminKeys.users(q, filter === "banned"),
    refetchInterval: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await six.api.GET("/v1/admin/users", {
          params: {
            query: {
              q: q || undefined,
              banned: filter === "banned" ? "true" : undefined,
              cursor: pageParam,
              limit: 30,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = users.data?.pages.flatMap((p) => p.items) ?? [];

  function check(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function setAds(ads: boolean) {
    unwrap(await six.api.POST("/v1/admin/users/ads", { body: { userIds: [...selected], ads } }));
    setSelected(new Set());
    refreshAdmin(qc);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by name, email or alias"
            aria-label="Search users"
            className="w-full rounded-xl bg-white py-2 pr-3 pl-9 text-[16px] ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-stone-900 dark:ring-stone-800"
          />
        </label>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Everyone" },
            { value: "banned", label: "Banned" },
          ]}
        />
      </div>
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-surface backdrop-blur-md px-4 py-2.5 shadow-sm ring-1 ring-surface-line">
          <span className="flex-1 text-sm font-medium">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => void setAds(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            Turn ads off
          </button>
          <button
            type="button"
            onClick={() => void setAds(true)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            Turn ads on
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Clear
          </button>
        </div>
      )}
      <ul className="space-y-3">
        {users.isPending && <li className="rounded-2xl bg-surface p-6 text-center text-sm text-stone-500 ring-1 ring-surface-line">Loading…</li>}
        {!users.isPending && items.length === 0 && (
          <li className="rounded-2xl bg-surface p-6 text-center text-sm text-stone-500 ring-1 ring-surface-line">Nobody matches.</li>
        )}
        {items.map((u) => (
          <UserRow key={u.id} u={u} checked={selected.has(u.id)} onCheck={(on) => check(u.id, on)} />
        ))}
      </ul>
      {users.hasNextPage && (
        <button
          type="button"
          onClick={() => void users.fetchNextPage()}
          disabled={users.isFetchingNextPage}
          className="w-full rounded-xl py-2.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-800 dark:hover:bg-stone-900"
        >
          {users.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
