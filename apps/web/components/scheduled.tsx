"use client";

import { unwrap } from "@six/sdk";
import { SCHEDULE_LIMITS, type ScheduledMessageDTO, maskSpoilers } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Flame, X } from "lucide-react";
import { useState } from "react";
import { hydrateScheduled } from "@/lib/e2ee";
import { cancelScheduled, rescheduleMessage, scheduledKey, sendScheduledNow } from "@/lib/actions";
import { shortRule } from "@/lib/ephemeral";
import { sendAtLabel, toLocalInput } from "@/lib/format";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { MediaLabel } from "./message-list";
import { PrimaryButton } from "./ui";

export function ScheduleDialog({
  title,
  initial,
  onPick,
  onClose,
}: {
  title: string;
  initial?: Date;
  onPick: (at: Date) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => toLocalInput(initial ?? new Date(Date.now() + 60 * 60 * 1000)));
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  function submit() {
    const at = new Date(value);
    if (Number.isNaN(at.getTime()) || at <= new Date()) return setError("Pick a time in the future.");
    if (at.getTime() - Date.now() > SCHEDULE_LIMITS.maxAheadSeconds * 1000)
      return setError("Pick a time within a year.");
    onPick(at);
  }

  return (
    <Dialog onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4 p-4"
      >
        <h2 className="text-center font-semibold">{title}</h2>
        <input
          type="datetime-local"
          value={value}
          min={toLocalInput(now)}
          max={toLocalInput(new Date(now.getTime() + SCHEDULE_LIMITS.maxAheadSeconds * 1000))}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          required
          autoFocus
          aria-label="Send at"
          className="block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800"
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
            Schedule
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

function Preview({ s }: { s: ScheduledMessageDTO }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-[15px]">
      {s.ephemeral && <Flame className="size-3.5 shrink-0 text-orange-500" aria-label={shortRule(s.ephemeral)} />}
      {s.type !== "text" && s.type !== "service" && <MediaLabel type={s.type} />}
      {s.spoiler && s.type === "text" ? (
        <span className="inline-flex items-center gap-1 italic">
          <EyeOff className="size-3.5" /> Spoiler
        </span>
      ) : (
        s.text && (
          <span className="truncate">
            {s.type !== "text" && "· "}
            {maskSpoilers(s.text, s.entities)}
          </span>
        )
      )}
    </span>
  );
}

export function ScheduledPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [rescheduling, setRescheduling] = useState<ScheduledMessageDTO | null>(null);
  const list = useQuery({
    queryKey: scheduledKey(chatId),
    queryFn: async () =>
      Promise.all(
        unwrap(await six.api.GET("/v1/chats/{id}/scheduled-messages", { params: { path: { id: chatId } } })).items.map(
          hydrateScheduled,
        ),
      ),
  });

  const run = (action: () => Promise<unknown>) =>
    void action().catch(() => qc.invalidateQueries({ queryKey: scheduledKey(chatId) }));

  if (rescheduling) {
    return (
      <ScheduleDialog
        title="Reschedule"
        initial={new Date(rescheduling.sendAt)}
        onClose={() => setRescheduling(null)}
        onPick={(at) => {
          setRescheduling(null);
          run(() => rescheduleMessage(qc, rescheduling, at));
        }}
      />
    );
  }

  const items = list.data ?? [];
  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">Scheduled messages</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      {list.isPending ? (
        <p className="p-6 text-center text-sm text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-sm text-stone-500">No scheduled messages.</p>
      ) : (
        <ul>
          {items.map((s) => (
            <li
              key={s.id}
              className="space-y-1.5 border-b border-stone-100 px-4 py-3 last:border-0 dark:border-stone-800"
            >
              <p className="text-xs font-medium text-brand">{sendAtLabel(s.sendAt)}</p>
              <Preview s={s} />
              <div className="flex gap-4 text-sm font-medium">
                <button type="button" onClick={() => run(() => sendScheduledNow(qc, s))} className="hover:underline">
                  Send now
                </button>
                <button type="button" onClick={() => setRescheduling(s)} className="hover:underline">
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => run(() => cancelScheduled(qc, s))}
                  className="text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
