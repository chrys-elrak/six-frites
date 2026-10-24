"use client";

import { unwrap } from "@six/sdk";
import type { InviteDTO } from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { shareInvite, timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Card, PrimaryButton, SectionTitle } from "./ui";

function usesLabel(i: InviteDTO) {
  const uses = `${i.uses} joined`;
  return i.maxUses === null ? uses : `${uses} · ${i.maxUses - i.uses} left`;
}

function expiryLabel(i: InviteDTO) {
  if (!i.expiresAt) return "Never expires";
  const ms = Date.parse(i.expiresAt) - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.ceil(ms / 864e5);
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

function InviteRow({ invite }: { invite: InviteDTO }) {
  const [flash, setFlash] = useState<string | null>(null);
  const expired = invite.expiresAt !== null && Date.parse(invite.expiresAt) < Date.now();
  const full = invite.maxUses !== null && invite.uses >= invite.maxUses;

  async function share() {
    const result = await shareInvite(invite.code);
    if (result === "copied") {
      setFlash("Link copied");
      setTimeout(() => setFlash(null), 1500);
    }
  }

  return (
    <div className={`flex items-center gap-3 p-4 ${expired || full ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-base font-semibold tracking-widest">{invite.code}</p>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {usesLabel(invite)} · {expiryLabel(invite)}
        </p>
      </div>
      {!expired && !full && (
        <button
          onClick={share}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          {flash ?? "Share"}
        </button>
      )}
    </div>
  );
}

export function Invites() {
  const qc = useQueryClient();
  const [flash, setFlash] = useState<string | null>(null);

  const invites = useInfiniteQuery({
    queryKey: ["invites"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/invites", { params: { query: { limit: 10, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const create = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites", { body: {} })),
    onSuccess: async (invite) => {
      await qc.invalidateQueries({ queryKey: ["invites"] });
      if ((await shareInvite(invite.code)) === "copied") {
        setFlash("Link copied to clipboard");
        setTimeout(() => setFlash(null), 2000);
      }
    },
  });

  const items = invites.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="space-y-3">
      <SectionTitle>Invite friends</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        <div className="flex items-center gap-3 p-4">
          <p className="flex-1 text-sm text-stone-600 dark:text-stone-300">
            {flash ?? "Send a link to someone you want to chat with."}
          </p>
          <PrimaryButton onClick={() => create.mutate()} disabled={create.isPending}>
            New link
          </PrimaryButton>
        </div>
        {items.map((i) => (
          <InviteRow key={i.code} invite={i} />
        ))}
        {invites.hasNextPage && (
          <button
            onClick={() => invites.fetchNextPage()}
            disabled={invites.isFetchingNextPage}
            className="w-full p-3 text-sm font-medium text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            Show older links
          </button>
        )}
      </Card>
    </section>
  );
}

export function Referrals() {
  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/referrals", { params: { query: { limit: 50 } } })),
  });

  const items = referrals.data?.items ?? [];
  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>Joined with your links</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <Avatar user={r.user} />
            <p className="min-w-0 flex-1 truncate font-medium">{r.user.displayName}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">{timeAgo(r.createdAt)}</p>
          </div>
        ))}
      </Card>
    </section>
  );
}
