"use client";

import { unwrap } from "@six/sdk";
import type { AdminUserDTO, BanScope } from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BAN_LENGTHS, BAN_SCOPES, adminKeys, banEnd, refreshAdmin } from "@/lib/admin";
import { formatBytes, timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Avatar } from "../avatar";
import { Dialog } from "../dialog";
import { Sheet } from "../sheet";
import { PrimaryButton } from "../ui";
import { Segmented } from "./segmented";

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

function UserRow({ u, checked, onCheck }: { u: AdminUserDTO; checked: boolean; onCheck: (on: boolean) => void }) {
  const qc = useQueryClient();
  const [banning, setBanning] = useState(false);
  const [limiting, setLimiting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [granting, setGranting] = useState(false);

  async function act(path: "/v1/admin/users/{id}/unban" | "/v1/admin/users/{id}/sign-out" | "/v1/admin/users/{id}/full-access") {
    unwrap(await six.api.POST(path, { params: { path: { id: u.id } } }));
    refreshAdmin(qc);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label={`Select ${u.displayName}`}
        className="size-4 accent-brand"
      />
      <Avatar user={u} />
      <div className="min-w-40 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium">
          <span className="min-w-0 truncate">{u.displayName}</span>
          {u.admin ? (
            <span className="shrink-0 text-xs text-brand">Admin</span>
          ) : u.guest || (u.bannedAt && u.banScope === "chat") ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
              Anonymous only
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[11px] font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
              Full access
            </span>
          )}
          {u.bannedAt && (
            <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
              {u.banScope === "chat" ? "Banned from chats" : "Banned"}
              {u.bannedUntil && ` until ${banEnd(u.bannedUntil)}`}
            </span>
          )}
          {u.queued && <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Waiting</span>}
          {!u.ads && <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">No ads</span>}
        </p>
        <p className="truncate text-xs text-stone-500">{u.email}</p>
        <p className="text-xs text-stone-500">
          Joined {timeAgo(u.createdAt)} · {u.lastActiveAt ? `active ${timeAgo(u.lastActiveAt)}` : "signed out"} ·{" "}
          {u.chats} chats · {u.messages} messages · {formatBytes(u.storageBytes)} stored · invited{" "}
          {u.admin ? u.invited : `${u.invited}/${u.inviteLimit}`}
          {u.waiting > 0 && <span className="text-amber-600 dark:text-amber-400"> · {u.waiting} waiting</span>}
          {u.openReports > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {" "}
              · {u.openReports} open report{u.openReports === 1 ? "" : "s"}
            </span>
          )}
        </p>
        {u.banReason && <p className="text-xs text-red-600 dark:text-red-400">Ban reason: {u.banReason}</p>}
        {u.seenBy && (
          <p className="text-xs text-brand">
            Seen under this alias by {u.seenBy.map((v) => `${v.displayName} (${v.email})`).join(", ")}
          </p>
        )}
      </div>
      {!u.admin && (
        <div className="ml-auto flex gap-2">
          {(u.guest || u.queued) && (
            <button
              type="button"
              onClick={() => setGranting(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Give full access
            </button>
          )}
          <button
            type="button"
            onClick={() => setLimiting(true)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
          >
            Invite limit
          </button>
          {u.activeSessions > 0 && (
            <button
              type="button"
              onClick={() => setSigningOut(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              Sign out
            </button>
          )}
          {u.bannedAt ? (
            <button
              type="button"
              onClick={() => void act("/v1/admin/users/{id}/unban")}
              className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800"
            >
              Lift ban
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBanning(true)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Ban
            </button>
          )}
        </div>
      )}
      {banning && <BanDialog user={u} onClose={() => setBanning(false)} />}
      {limiting && <LimitDialog user={u} onClose={() => setLimiting(false)} />}
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
      <ul className="divide-y divide-surface-line rounded-2xl bg-surface backdrop-blur-md shadow-sm ring-1 ring-surface-line">
        {users.isPending && <li className="p-6 text-center text-sm text-stone-500">Loading…</li>}
        {!users.isPending && items.length === 0 && (
          <li className="p-6 text-center text-sm text-stone-500">Nobody matches.</li>
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
