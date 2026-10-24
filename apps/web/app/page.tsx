"use client";

import { unwrap } from "@six/sdk";
import type { SessionDTO } from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";

const platformIcon: Record<SessionDTO["platform"], string> = { web: "🖥️", ios: "📱", android: "📱" };

function timeAgo(iso: string) {
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

function Profile() {
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.displayName);

  const save = useMutation({
    mutationFn: async () => unwrap(await six.api.PATCH("/v1/me", { body: { displayName: name.trim() } })),
    onSuccess: setUser,
  });

  const dirty = name.trim() !== user.displayName && name.trim().length > 0;

  return (
    <section className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-full" />
      ) : (
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-brand text-xl font-semibold text-brand-ink">
          {user.displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <form
        className="min-w-0 flex-1 space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate();
        }}
      >
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            aria-label="Display name"
            className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg font-medium outline-none ring-stone-300 focus:ring-2 dark:ring-stone-700"
          />
          {dirty && (
            <button
              disabled={save.isPending}
              className="rounded-lg bg-stone-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
              Save
            </button>
          )}
        </div>
        <p className="truncate px-2 text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
      </form>
    </section>
  );
}

function Devices() {
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => unwrap(await six.api.GET("/v1/sessions")).items,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await six.api.DELETE("/v1/sessions/{id}", { params: { path: { id } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const revokeOthers = useMutation({
    mutationFn: async () => unwrap(await six.api.DELETE("/v1/sessions")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const others = sessions.data?.filter((s) => !s.current).length ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Devices</h2>
        {others > 0 && (
          <button
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
            className="text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-400"
          >
            Log out other devices
          </button>
        )}
      </div>

      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
        {sessions.isPending && <li className="p-4 text-sm text-stone-500">Loading…</li>}
        {sessions.isError && <li className="p-4 text-sm text-red-600">Couldn't load devices.</li>}
        {sessions.data?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 p-4">
            <span className="text-2xl" aria-hidden>
              {platformIcon[s.platform]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {s.deviceName ?? s.platform}
                {s.current && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    This device
                  </span>
                )}
              </p>
              <p className="text-sm text-stone-500 dark:text-stone-400">Active {timeAgo(s.lastUsedAt)}</p>
            </div>
            {!s.current && (
              <button
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending && revoke.variables === s.id}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                Log out
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "authed") {
    return <main className="grid min-h-dvh place-items-center text-sm text-stone-500">Loading…</main>;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">🍟 Six Frites</h1>
        <button
          onClick={() => void six.auth.logout()}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          Sign out
        </button>
      </header>
      <Profile />
      <Devices />
      <p className="px-1 text-center text-sm text-stone-500 dark:text-stone-400">Chats arrive in step 6.</p>
    </main>
  );
}
