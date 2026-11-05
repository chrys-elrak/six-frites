"use client";

import { unwrap } from "@six/sdk";
import {
  NOTE_LIMIT,
  NOTE_SECS,
  type NoteDTO,
  type PublicUser,
  STORY_DURATIONS,
  STORY_DURATION_UNITS,
  STORY_LIMITS,
  durationLabel,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";
import { useState } from "react";
import { useChats } from "@/lib/chats";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { six } from "@/lib/six";
import { DurationPicker } from "./auto-delete-custom";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { PrimaryButton } from "./ui";

/** Under the stories key, so `stories:changed` refreshes notes too. */
export const notesKey = ["stories", "notes"] as const;
const live = (n: NoteDTO) => Date.parse(n.expiresAt) > Date.now();

export function useNotes() {
  return useQuery({
    queryKey: notesKey,
    queryFn: async () => unwrap(await six.api.GET("/v1/notes")),
    select: (d) => ({ mine: d.mine && live(d.mine) ? d.mine : null, items: d.items.filter((n) => live(n.note)) }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** The thought bubble above someone's picture in the stories row; `empty` shows the text greyed, as an invitation. */
export function NoteBubble({ text, empty, label, onClick }: { text: string; empty?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={text}
      className={`relative z-10 -mb-2 max-w-[4.5rem] rounded-2xl bg-white px-2 py-1 text-center text-[11px] leading-tight break-words shadow ring-1 ring-black/5 dark:bg-stone-800 dark:ring-white/10 ${
        empty ? "text-stone-400" : "font-medium"
      }`}
    >
      <span className="line-clamp-2">{text}</span>
    </button>
  );
}

/** Asks how long a story or a note stays up, in hours. */
export function LastsPicker({ value, onSave, onClose }: { value: number; onSave: (secs: number) => void; onClose: () => void }) {
  const tr = useT();
  return (
    <DurationPicker
      value={value}
      units={STORY_DURATION_UNITS}
      range={{ min: STORY_LIMITS.minSecs, max: STORY_LIMITS.maxSecs }}
      title={tr.stories.customDuration}
      hint={tr.stories.durationHint}
      rangeHint={tr.stories.durationRange}
      submit={tr.stories.setDuration}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

/** Writes, changes or takes down my note. */
export function NoteEditor({ note, onClose }: { note: NoteDTO | null; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [text, setText] = useState(note?.text ?? "");
  const [durationSecs, setDurationSecs] = useState(NOTE_SECS);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const chip = (on: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${on ? "bg-brand text-brand-ink" : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"}`;
  const preset = (STORY_DURATIONS as readonly number[]).includes(durationSecs);

  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    setFailed(false);
    try {
      await call();
      await qc.invalidateQueries({ queryKey: notesKey });
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void run(async () => unwrap(await six.api.PUT("/v1/notes", { body: { text: text.trim(), durationSecs } })));
        }}
        className="flex flex-col gap-3 p-5"
      >
        <h2 className="text-lg font-semibold">{tr.stories.yourNote}</h2>
        <div className="relative">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={NOTE_LIMIT}
            placeholder={tr.stories.notePlaceholder}
            aria-label={tr.stories.note}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 pr-14 text-[16px] outline-none focus:border-brand dark:border-stone-700 dark:bg-stone-900"
          />
          <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs text-stone-400">{NOTE_LIMIT - text.length}</span>
        </div>
        <div role="radiogroup" aria-label={tr.stories.lasts} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-stone-500">{tr.stories.lasts}</span>
          {STORY_DURATIONS.map((secs) => (
            <button key={secs} type="button" role="radio" aria-checked={durationSecs === secs} onClick={() => setDurationSecs(secs)} className={chip(durationSecs === secs)}>
              {durationLabel(secs, tr)}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={!preset} onClick={() => setCustom(true)} className={chip(!preset)}>
            {preset ? tr.stories.custom : durationLabel(durationSecs, tr)}
          </button>
        </div>
        <p className="text-sm text-stone-500">{tr.stories.noteHint}</p>
        {failed && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {tr.common.somethingWrongRetry}
          </p>
        )}
        <div className="flex items-center gap-2">
          {note && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => six.api.DELETE("/v1/notes"))}
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              {tr.stories.deleteNote}
            </button>
          )}
          <PrimaryButton type="submit" disabled={busy || !text.trim()} className="ml-auto">
            {tr.stories.post}
          </PrimaryButton>
        </div>
      </form>
      {custom && <LastsPicker value={durationSecs} onSave={setDurationSecs} onClose={() => setCustom(false)} />}
    </Dialog>
  );
}

/** A contact's note, with a box to answer it in your chat with them. */
export function NoteReader({ user, note, onClose }: { user: PublicUser; note: NoteDTO; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const chats = [...(useChats().data ?? []), ...(useChats(true).data ?? [])];
  const chat = chats.find((c) => c.type === "direct" && c.members.some((m) => m.user.id === user.id));
  const [text, setText] = useState("");

  function send() {
    if (!text.trim() || !chat || !realtime) return;
    const story = { id: note.id, ownerId: user.id, kind: "note" as const, text: note.text, background: null, imageUrl: null };
    void queueMessage(qc, realtime, chat.id, { text: text.trim(), story });
    onClose();
  }

  return (
    <Dialog onClose={onClose}>
      <div className="flex flex-col items-center gap-3 p-5">
        <span className="rounded-3xl bg-white px-4 py-2.5 text-center text-base font-medium break-words shadow ring-1 ring-black/5 dark:bg-stone-800 dark:ring-white/10">
          {note.text}
        </span>
        <Avatar user={user} size="lg" />
        <p className="text-center">
          <span className="font-semibold">{user.displayName}</span>
          <span className="text-sm text-stone-500"> · {timeAgo(note.createdAt)}</span>
        </p>
        {chat && realtime && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex w-full items-center gap-2"
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              placeholder={tr.stories.replyTo(user.displayName)}
              aria-label={tr.stories.replyTo(user.displayName)}
              className="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[16px] outline-none focus:border-brand dark:border-stone-700 dark:bg-stone-900"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label={tr.common.send}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-50"
            >
              <SendHorizontal className="size-5" />
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
