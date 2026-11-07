"use client";

import { unwrap } from "@six/sdk";
import {
  NOTE_BACKGROUNDS,
  emojifyEnd,
  emojifyTyped,
  NOTE_LIMIT,
  NOTE_SECS,
  type NoteDTO,
  type PublicUser,
  STORY_DURATIONS,
  STORY_DURATION_UNITS,
  STORY_LIMITS,
  STORY_REACTIONS,
  type StoryReaction,
  countReactions,
  durationLabel,
  inkOn,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Eye, SendHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useChats } from "@/lib/chats";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { six } from "@/lib/six";
import { DurationPicker } from "./auto-delete-custom";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { GifSearch } from "./gif-picker";
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

const tint = (background: string | null | undefined) => (background ? { background, color: inkOn(background) } : undefined);
const plain = "bg-white ring-1 ring-black/5 dark:bg-stone-800 dark:ring-white/10";
const Loop = ({ src, className }: { src: string; className: string }) => <video src={src} autoPlay loop muted playsInline className={className} />;

/** The thought bubble above someone's picture in the stories row: their GIF, or their words, on their colour. Without a note it shows `placeholder` greyed, as an invitation. */
export function NoteBubble({ note, placeholder, label, onClick }: { note: NoteDTO | null; placeholder?: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={note?.text || undefined}
      style={tint(note?.background)}
      className={`relative z-10 -mb-2 max-w-[4.5rem] overflow-hidden rounded-2xl shadow ${note?.background ? "" : plain} ${
        note?.gif ? "p-0.5" : `px-2 py-1 text-center text-[11px] leading-tight break-words ${note ? "font-medium" : "text-stone-400"}`
      }`}
    >
      {note?.gif ? <Loop src={note.gif.url} className="h-8 rounded-[14px] object-cover" /> : <span className="line-clamp-2">{note?.text ?? placeholder}</span>}
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

/** How many contacts opened my note, and who, once asked. */
function NoteViewers({ count }: { count: number }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const viewers = useQuery({
    queryKey: [...notesKey, "viewers"],
    queryFn: async () => unwrap(await six.api.GET("/v1/notes/viewers")).items,
    enabled: open,
  });
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:underline dark:text-stone-300"
      >
        <Eye className="size-4" />
        {tr.stories.views(viewers.data?.length ?? count)}
      </button>
      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto">
          {viewers.isPending && <p className="text-sm text-stone-500">{tr.common.loading}</p>}
          {viewers.data?.length === 0 && <p className="text-sm text-stone-500">{tr.stories.noViews}</p>}
          {viewers.data?.map((v) => (
            <div key={v.user.id} className="flex items-center gap-3 py-1.5">
              <Avatar user={v.user} />
              <span className="min-w-0 flex-1 truncate">{v.user.displayName}</span>
              <span className="text-xs text-stone-500">{timeAgo(v.viewedAt)}</span>
              {countReactions(v.reactions).map(([emoji, n]) => (
                <span key={emoji} className="flex items-baseline text-xl leading-none">
                  {emoji}
                  {n > 1 && <span className="text-xs font-semibold text-stone-500">{n}</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Writes, changes or takes down my note. */
export function NoteEditor({ note, onClose }: { note: NoteDTO | null; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [text, setText] = useState(note?.text ?? "");
  const [background, setBackground] = useState(note?.background ?? null);
  const [gif, setGif] = useState(note?.gif ? { id: note.gif.id, src: note.gif.url, video: true } : null);
  const [pickingGif, setPickingGif] = useState(false);
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
          if (text.trim() || gif)
            void run(async () =>
              unwrap(await six.api.PUT("/v1/notes", { body: { text: emojifyEnd(text).trim(), gifId: gif?.id, background: background ?? undefined, durationSecs } })),
            );
        }}
        className="flex flex-col gap-3 p-5"
      >
        <h2 className="text-lg font-semibold">{tr.stories.yourNote}</h2>
        {gif && (
          <div className="relative self-center">
            {gif.video ? (
              <Loop src={gif.src} className="max-h-32 rounded-2xl" />
            ) : (
              <img src={gif.src} alt="" draggable={false} className="max-h-32 rounded-2xl" />
            )}
            <button
              type="button"
              onClick={() => setGif(null)}
              aria-label={tr.common.remove}
              className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-stone-900 text-white shadow"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="relative">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(emojifyTyped(text, e.target.value)?.text ?? e.target.value)}
            maxLength={NOTE_LIMIT}
            placeholder={tr.stories.notePlaceholder}
            aria-label={tr.stories.note}
            style={tint(background)}
            className={`w-full rounded-2xl border px-4 py-3 pr-14 text-[16px] outline-none ${
              background ? "border-transparent placeholder:text-current placeholder:opacity-60" : "border-stone-200 bg-white focus:border-brand dark:border-stone-700 dark:bg-stone-900"
            }`}
          />
          <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs opacity-60" style={background ? { color: inkOn(background) } : undefined}>
            {NOTE_LIMIT - text.length}
          </span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto p-1">
          <div role="radiogroup" aria-label={tr.stories.background} className="flex items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={!background}
              aria-label={tr.stories.noColour}
              onClick={() => setBackground(null)}
              className={`grid size-7 shrink-0 place-items-center rounded-full bg-white text-stone-400 ring-1 ring-stone-300 dark:bg-stone-800 dark:ring-stone-600 ${!background ? "outline-2 outline-offset-2 outline-brand" : ""}`}
            >
              <Ban className="size-4" />
            </button>
            {NOTE_BACKGROUNDS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={background === c}
                aria-label={c}
                onClick={() => setBackground(c)}
                style={{ background: c }}
                className={`size-7 shrink-0 rounded-full ${background === c ? "outline-2 outline-offset-2 outline-brand" : ""}`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-pressed={pickingGif}
            onClick={() => setPickingGif(!pickingGif)}
            className={`ml-auto shrink-0 rounded-full px-3 py-1 text-sm font-bold ${pickingGif ? "bg-brand text-brand-ink" : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"}`}
          >
            {tr.stories.gif}
          </button>
        </div>
        {pickingGif && (
          <div className="-mx-3">
            <GifSearch
              onPick={(g) => {
                setGif({ id: g.id, src: g.previewUrl, video: false });
                setPickingGif(false);
              }}
            />
          </div>
        )}
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
        {note && <NoteViewers count={note.viewCount ?? 0} />}
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
          <PrimaryButton type="submit" disabled={busy || (!text.trim() && !gif)} className="ml-auto">
            {tr.stories.post}
          </PrimaryButton>
        </div>
      </form>
      {custom && <LastsPicker value={durationSecs} onSave={setDurationSecs} onClose={() => setCustom(false)} />}
    </Dialog>
  );
}

/** A contact's note, with quick reactions only they see and a box to answer it in your chat with them. */
export function NoteReader({ user, note, onClose }: { user: PublicUser; note: NoteDTO; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const chats = [...(useChats().data ?? []), ...(useChats(true).data ?? [])];
  const chat = chats.find((c) => c.type === "direct" && c.members.some((m) => m.user.id === user.id));
  const [text, setText] = useState("");
  const [popped, setPopped] = useState({ emoji: "", n: 0 });
  useEffect(() => {
    void six.api.POST("/v1/notes/{id}/view", { params: { path: { id: note.id } } });
  }, [note.id]);

  const react = (emoji: StoryReaction) => {
    void six.api.POST("/v1/notes/{id}/react", { params: { path: { id: note.id } }, body: { emoji } });
    setPopped((p) => ({ emoji, n: p.n + 1 }));
  };

  function send() {
    if (!text.trim() || !chat || !realtime) return;
    const story = { id: note.id, ownerId: user.id, kind: "note" as const, text: note.text || null, background: note.background, imageUrl: null };
    void queueMessage(qc, realtime, chat.id, { text: emojifyEnd(text).trim(), story });
    onClose();
  }

  return (
    <Dialog onClose={onClose}>
      <div className="flex flex-col items-center gap-3 p-5">
        <span
          style={tint(note.background)}
          className={`flex max-w-full flex-col items-center gap-2 rounded-3xl text-center text-base font-medium break-words shadow ${note.background ? "" : plain} ${note.gif ? "p-1.5" : "px-4 py-2.5"}`}
        >
          {note.gif && <Loop src={note.gif.url} className="max-h-48 rounded-[1.25rem]" />}
          {note.text && <span className={note.gif ? "px-2.5 pb-1" : ""}>{note.text}</span>}
        </span>
        <Avatar user={user} size="lg" />
        <p className="text-center">
          <span className="font-semibold">{user.displayName}</span>
          <span className="text-sm text-stone-500"> · {timeAgo(note.createdAt)}</span>
        </p>
        <div className="flex justify-center gap-1">
          {STORY_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              aria-label={emoji}
              className="grid size-10 place-items-center rounded-full text-2xl transition hover:scale-125 active:scale-95"
            >
              <span key={popped.emoji === emoji ? popped.n : 0} className={popped.emoji === emoji ? "piece-pop" : undefined}>
                {emoji}
              </span>
            </button>
          ))}
        </div>
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
              onChange={(e) => setText(emojifyTyped(text, e.target.value)?.text ?? e.target.value)}
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
