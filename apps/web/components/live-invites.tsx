"use client";

import { LIVE_EMOJI, type LiveGame, type LiveInviteDTO } from "@six/shared";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useChats } from "@/lib/chats";
import { useLocale, useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { Portal } from "./portal";

const MAX_INVITES = 3;

/** Picks up to three contacts to ask into a new live room, then opens it. */
export function NewLiveRoom({ game, onClose }: { game: LiveGame; onClose: () => void }) {
  const tr = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const { realtime } = useRealtime();
  const meId = useSession((s) => s.user!.id);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const friends = (useChats().data ?? []).flatMap((c) => {
    const peer = c.members.find((m) => m.user.id !== meId)?.user;
    return peer && !c.blockedByMe && !c.blockedByThem && !c.peerDeleted ? [{ ...peer, displayName: c.title }] : [];
  });

  async function create() {
    if (!realtime || busy) return;
    setBusy(true);
    const res = await realtime.socket
      .timeout(10_000)
      .emitWithAck("live:create", { game, invite: picked, locale })
      .catch(() => null);
    setBusy(false);
    if (res?.ok) router.push(`/play/${res.data.id}`);
    onClose();
  }

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">
          {LIVE_EMOJI[game]} {tr.live.games[game]}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="px-4 pt-3 text-sm font-semibold">{tr.live.inviteFriends}</p>
      <p className="px-4 text-xs text-stone-500">{tr.live.inviteHint}</p>
      <ul className="max-h-[50dvh] overflow-y-auto py-1">
        {friends.map((f) => {
          const on = picked.includes(f.id);
          return (
            <li key={f.id}>
              <button
                type="button"
                disabled={!on && picked.length >= MAX_INVITES}
                onClick={() => setPicked((p) => (on ? p.filter((id) => id !== f.id) : [...p, f.id]))}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
              >
                <Avatar user={f} />
                <span className="min-w-0 flex-1 truncate font-medium">{f.displayName}</span>
                <span
                  className={`grid size-6 place-items-center rounded-full ring-2 ${on ? "bg-brand text-brand-ink ring-brand" : "ring-stone-300 dark:ring-stone-700"}`}
                >
                  {on && <Check className="size-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="p-4 pt-2">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !realtime}
          className="w-full rounded-xl bg-brand py-3 font-semibold text-brand-ink disabled:opacity-50"
        >
          {tr.live.create}
        </button>
      </div>
    </Dialog>
  );
}

/** Banners for contacts asking me into their live games, open until I join or close them. */
export function LiveInvites() {
  const tr = useT();
  const router = useRouter();
  const { realtime } = useRealtime();
  const [invites, setInvites] = useState<LiveInviteDTO[]>([]);
  const drop = (roomId: string) => setInvites((all) => all.filter((i) => i.roomId !== roomId));

  useEffect(() => {
    const socket = realtime?.socket;
    if (!socket) return;
    const onInvite = (i: LiveInviteDTO) => setInvites((all) => [...all.filter((x) => x.roomId !== i.roomId), i]);
    const onClosed = (e: { roomId: string }) => drop(e.roomId);
    socket.on("live:invite", onInvite);
    socket.on("live:closed", onClosed);
    return () => {
      socket.off("live:invite", onInvite);
      socket.off("live:closed", onClosed);
    };
  }, [realtime]);

  if (!invites.length) return null;
  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2.5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:items-end md:p-4">
        {invites.map((i) => (
          <div
            key={i.roomId}
            className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_320ms_cubic-bezier(0.2,0.9,0.3,1.15)] items-center gap-3 rounded-3xl bg-white/85 p-3 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl dark:bg-stone-900/85 dark:ring-white/10"
          >
            <span className="relative shrink-0">
              <Avatar user={i.from} />
              <span className="absolute -right-1 -bottom-1 text-base">{LIVE_EMOJI[i.game]}</span>
            </span>
            <span className="min-w-0 flex-1 text-sm leading-snug font-medium">
              {tr.live.invites(i.from.displayName, tr.live.games[i.game])}
            </span>
            <button
              type="button"
              onClick={() => {
                drop(i.roomId);
                router.push(`/play/${i.roomId}`);
              }}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
            >
              {tr.live.join}
            </button>
            <button
              type="button"
              onClick={() => drop(i.roomId)}
              aria-label={tr.common.dismiss}
              className="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-900/5 dark:hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Portal>
  );
}
