"use client";

import { SixApiError, unwrap } from "@six/sdk";
import {
  type InviteDTO,
  inviteSummary,
  MAX_INVITE_DAYS,
  MAX_INVITE_MESSAGE,
  MAX_INVITE_USES,
  quotaSummary,
} from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { inviteUrl, shareInvite, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";
import { Card, PrimaryButton, SectionTitle } from "./ui";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function NewInviteDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(7);
  const [copied, setCopied] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await six.api.POST("/v1/invites", {
          body: { message: message.trim() || undefined, maxUses, expiresInDays: days },
        }),
      ),
    onSuccess: async (invite) => {
      void qc.invalidateQueries({ queryKey: ["invites"] });
      if ((await shareInvite(invite.code)) === "copied") setCopied(invite.code);
      else onClose();
    },
  });

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.settings.newLink}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      {copied ? (
        <div className="space-y-4 p-4">
          <p className="text-sm text-stone-500">{tr.settings.linkCopied}</p>
          <p className="break-all rounded-xl bg-stone-100 px-3 py-2.5 font-mono text-sm dark:bg-stone-800">
            {inviteUrl(copied)}
          </p>
          <PrimaryButton type="button" onClick={onClose} className="w-full">
            {tr.common.done}
          </PrimaryButton>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4 p-4"
        >
          <div className="space-y-1">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_INVITE_MESSAGE}
              rows={3}
              placeholder={tr.settings.inviteMessagePlaceholder}
              aria-label={tr.settings.inviteMessage}
              className="block w-full resize-none rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm"
            />
            <p className="text-xs text-stone-500">{tr.settings.inviteMessageHint}</p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{tr.settings.invitePeople}</span>
            <select
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800"
            >
              {range(MAX_INVITE_USES).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{tr.settings.inviteValidFor}</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800"
            >
              {range(MAX_INVITE_DAYS).map((n) => (
                <option key={n} value={n}>
                  {tr.time.duration(n, "day")}
                </option>
              ))}
            </select>
          </label>
          {create.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {create.error instanceof SixApiError ? create.error.message : tr.common.somethingWrong}
            </p>
          )}
          <PrimaryButton type="submit" disabled={create.isPending} className="w-full">
            {tr.settings.createLink}
          </PrimaryButton>
        </form>
      )}
    </Dialog>
  );
}

function InviteRow({ invite, onRevoke }: { invite: InviteDTO; onRevoke: () => void }) {
  const tr = useT();
  const [flash, setFlash] = useState<string | null>(null);
  const live = invite.status === "valid" && !(invite.expiresAt && Date.parse(invite.expiresAt) < Date.now());

  async function share() {
    if ((await shareInvite(invite.code)) === "copied") {
      setFlash(tr.settings.linkCopied);
      setTimeout(() => setFlash(null), 1500);
    }
  }

  return (
    <div className={`flex items-center gap-3 p-4 ${live ? "" : "opacity-50"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-base font-semibold tracking-widest">{invite.code}</p>
        {invite.message && <p className="truncate text-sm italic">“{invite.message}”</p>}
        <p className="text-sm text-stone-500 dark:text-stone-400">{inviteSummary(invite, tr)}</p>
      </div>
      {live && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={share}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {flash ?? tr.common.share}
          </button>
          <button
            onClick={onRevoke}
            className="rounded-lg px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            {tr.settings.revoke}
          </button>
        </div>
      )}
    </div>
  );
}

export function Invites() {
  const tr = useT();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const invites = useInfiniteQuery({
    queryKey: ["invites"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/invites", { params: { query: { limit: 10, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const quota = useQuery({
    queryKey: ["invite-quota"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/invite-quota")),
  });

  const revoke = useMutation({
    mutationFn: async (code: string) =>
      unwrap(await six.api.POST("/v1/invites/{code}/revoke", { params: { path: { code } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });

  const items = invites.data?.pages.flatMap((p) => p.items) ?? [];
  const used = quota.data && quotaSummary(quota.data, tr);
  const full = quota.data?.limit != null && quota.data.invited >= quota.data.limit;

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.inviteFriends}</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        <div className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm text-stone-600 dark:text-stone-300">{tr.settings.inviteHint}</p>
            {used && <p className="text-xs text-stone-500 dark:text-stone-400">{used}</p>}
            {full && <p className="text-xs text-amber-700 dark:text-amber-400">{tr.settings.inviteLimitReached}</p>}
          </div>
          <PrimaryButton onClick={() => setCreating(true)}>{tr.settings.newLink}</PrimaryButton>
        </div>
        {items.length > 0 && (
          <div className="divide-y divide-stone-200 lg:max-h-80 lg:overflow-y-auto lg:overscroll-contain dark:divide-stone-800">
            {items.map((i) => (
              <InviteRow key={i.code} invite={i} onRevoke={() => setRevoking(i.code)} />
            ))}
            {invites.hasNextPage && (
              <button
                onClick={() => invites.fetchNextPage()}
                disabled={invites.isFetchingNextPage}
                className="w-full p-3 text-sm font-medium text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800"
              >
                {tr.settings.showOlderLinks}
              </button>
            )}
          </div>
        )}
      </Card>
      {creating && <NewInviteDialog onClose={() => setCreating(false)} />}
      {revoking && (
        <Sheet
          title={tr.settings.revokeWarning}
          actions={[{ label: tr.settings.revoke, destructive: true, onSelect: () => revoke.mutate(revoking) }]}
          onClose={() => setRevoking(null)}
        />
      )}
    </section>
  );
}

export function Referrals() {
  const tr = useT();
  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/referrals", { params: { query: { limit: 50 } } })),
  });

  const items = referrals.data?.items ?? [];
  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.joinedWithLinks}</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden lg:max-h-80 lg:overflow-y-auto lg:overscroll-contain dark:divide-stone-800">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <Avatar user={r.user} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.user.displayName}</p>
              <p className="font-mono text-xs text-stone-500 dark:text-stone-400">{tr.settings.viaLink(r.inviteCode)}</p>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400">{timeAgo(r.createdAt)}</p>
          </div>
        ))}
      </Card>
    </section>
  );
}
