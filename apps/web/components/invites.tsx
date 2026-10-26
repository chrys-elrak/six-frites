"use client";

import { unwrap } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { shareInvite, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Sheet } from "./sheet";
import { Card, PrimaryButton, SectionTitle } from "./ui";

export const inviteQuery = {
  queryKey: ["invite"],
  queryFn: async () => unwrap(await six.api.GET("/v1/me/invite")),
};

export function Invites() {
  const tr = useT();
  const qc = useQueryClient();
  const invite = useQuery(inviteQuery);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const reset = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/me/invite/reset")),
    onSuccess: (i) => qc.setQueryData(inviteQuery.queryKey, i),
  });

  async function share() {
    if (!invite.data) return;
    if ((await shareInvite(invite.data.code)) === "copied") {
      setFlash(tr.settings.linkCopied);
      setTimeout(() => setFlash(null), 1500);
    }
  }

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.inviteFriends}</SectionTitle>
      <Card className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {tr.settings.inviteLink}
          </p>
          <p className="font-mono text-base font-semibold tracking-widest">
            {invite.data?.code ?? "…"}
          </p>
          {invite.data && (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {tr.settings.joined(invite.data.uses)} · {tr.settings.neverExpires}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <PrimaryButton onClick={share} disabled={!invite.data}>
            {flash ?? tr.common.share}
          </PrimaryButton>
          <button
            onClick={() => setConfirmReset(true)}
            disabled={!invite.data || reset.isPending}
            className="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            {tr.settings.newLink}
          </button>
        </div>
      </Card>
      {confirmReset && (
        <Sheet
          title={tr.settings.resetInviteWarning}
          actions={[
            {
              label: tr.settings.getNewLink,
              destructive: true,
              onSelect: () => reset.mutate(),
            },
          ]}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </section>
  );
}

export function Referrals() {
  const tr = useT();
  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: async () =>
      unwrap(
        await six.api.GET("/v1/me/referrals", {
          params: { query: { limit: 50 } },
        }),
      ),
  });

  const items = referrals.data?.items ?? [];
  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.joinedWithLink}</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <Avatar user={r.user} />
            <p className="min-w-0 flex-1 truncate font-medium">
              {r.user.displayName}
            </p>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {timeAgo(r.createdAt)}
            </p>
          </div>
        ))}
      </Card>
    </section>
  );
}
