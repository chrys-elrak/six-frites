"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Portal } from "./portal";
import { Card, SectionTitle } from "./ui";

export function BlockedPeople() {
  const qc = useQueryClient();
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/blocks")).items,
  });
  const unblock = useMutation({
    mutationFn: async (id: string) => unwrap(await six.api.DELETE("/v1/users/{id}/block", { params: { path: { id } } })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["blocks"] });
      void qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });

  if (!blocks.data?.length) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>Blocked people</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        {blocks.data.map((b) => (
          <div key={b.user.id} className="flex items-center gap-3 p-4">
            <Avatar user={b.user} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.user.displayName}</p>
              <p className="text-sm text-stone-500 dark:text-stone-400">Blocked {timeAgo(b.createdAt)}</p>
            </div>
            <button
              onClick={() => unblock.mutate(b.user.id)}
              disabled={unblock.isPending}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Unblock
            </button>
          </div>
        ))}
      </Card>
    </section>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3">
      <SectionTitle>Account</SectionTitle>
      <Card className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Delete account</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">Signs you out everywhere and removes your profile.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete…
        </button>
      </Card>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </section>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      unwrap(await six.api.DELETE("/v1/me", { body: { confirm: "DELETE" } }));
      await six.auth.logout().catch(() => null);
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !remove.isPending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, remove.isPending]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        role="dialog"
        aria-modal
        aria-label="Delete account"
      >
        <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <form
          className="relative w-full max-w-sm space-y-4 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === "DELETE") remove.mutate();
          }}
        >
          <div className="flex items-center">
            <h2 className="flex-1 text-lg font-semibold">Delete your account?</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>You're signed out on every device.</li>
            <li>Your name, photo, email, username and contact code are removed, so nobody can find you.</li>
            <li>Messages you already sent stay in other people's chats, shown as "Deleted account".</li>
            <li>This can't be undone. Signing in again with Google starts a new, empty account.</li>
          </ul>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-stone-600 dark:text-stone-300">Type DELETE to confirm</span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-red-500 dark:bg-stone-800"
            />
          </label>
          {remove.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {remove.error instanceof SixApiError ? remove.error.message : "Couldn't delete your account. Try again."}
            </p>
          )}
          <button
            type="submit"
            disabled={typed !== "DELETE" || remove.isPending}
            className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {remove.isPending ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      </div>
    </Portal>
  );
}
