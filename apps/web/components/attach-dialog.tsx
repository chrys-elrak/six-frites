"use client";

import { kindFor } from "@six/sdk";
import { type EphemeralInput, type UploadKind, stripAudio } from "@six/shared";
import { EyeOff, FileText, Pencil, SendHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { EphemeralPicker } from "./ephemeral-picker";
import { PhotoEditor } from "./photo-editor";
import { Portal } from "./portal";

export interface PickedFile {
  file: File;
  kind: UploadKind;
  spoiler: boolean;
}

interface Item extends PickedFile {
  id: string;
  /** The video with its sound, kept while it is muted so unmuting is instant. */
  unmuted?: File;
}

const visual = (kind: UploadKind) => kind === "image" || kind === "video";
const editable = (item: Item) => item.kind === "image" && item.file.type !== "image/gif";
const pill = (on: boolean) =>
  `flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium backdrop-blur ${
    on ? "bg-brand text-brand-ink" : "bg-black/45 text-white hover:bg-black/60"
  }`;

function Preview({
  item,
  url,
  large,
  onToggleSpoiler,
  onEdit,
  onToggleMute,
  onRemove,
}: {
  item: Item;
  url: string | undefined;
  large: boolean;
  onToggleSpoiler: () => void;
  onEdit: () => void;
  onToggleMute: () => void;
  onRemove: () => void;
}) {
  const tr = useT();
  const fit = large ? "max-h-full max-w-full object-contain" : "size-full object-cover";
  const media = !url ? null : item.kind === "image" ? (
    <img src={url} alt="" className={fit} />
  ) : (
    <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className={fit} />
  );

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800 ${
        large ? "h-[min(50dvh,420px)]" : "aspect-square"
      }`}
    >
      <div
        className={`flex size-full items-center justify-center transition duration-300 ${
          item.spoiler ? "scale-110 blur-xl brightness-75" : ""
        }`}
      >
        {media}
      </div>
      {item.spoiler && (
        <span className="spoiler pointer-events-none absolute inset-0 rounded-none text-white/85" aria-hidden />
      )}
      <div className="absolute inset-x-0 top-0 flex justify-between p-1.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onToggleSpoiler}
            aria-pressed={item.spoiler}
            title={item.spoiler ? tr.composer.showNormally : tr.composer.hideWithSpoiler}
            className={pill(item.spoiler)}
          >
            <EyeOff className="size-3.5" />
            {large && (item.spoiler ? tr.composer.spoilerOn : tr.summary.spoiler)}
          </button>
          {editable(item) && (
            <button type="button" onClick={onEdit} title={tr.composer.editPhoto} className={pill(false)}>
              <Pencil className="size-3.5" />
              {large && tr.composer.edit}
            </button>
          )}
          {item.kind === "video" && (
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={!!item.unmuted}
              title={item.unmuted ? tr.composer.unmute : tr.composer.mute}
              className={pill(!!item.unmuted)}
            >
              {item.unmuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              {large && (item.unmuted ? tr.composer.muted : tr.composer.mute)}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={tr.common.remove}
          className="grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function AttachDialog({
  files,
  editFirst = false,
  initialCaption,
  initialEphemeral,
  onCancel,
  onSend,
}: {
  files: File[];
  editFirst?: boolean;
  initialCaption: string;
  initialEphemeral: EphemeralInput | null;
  onCancel: () => void;
  onSend: (items: PickedFile[], caption: string, ephemeral: EphemeralInput | null) => void;
}) {
  const tr = useT();
  const [items, setItems] = useState<Item[]>(() =>
    files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      kind: kindFor(file.type || "application/octet-stream"),
      spoiler: false,
    })),
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileIds = items.map((i) => i.id).join();
  const [caption, setCaption] = useState(initialCaption);
  const [ephemeral, setEphemeral] = useState(initialEphemeral);
  const [editing, setEditing] = useState<Item | null>(() => (editFirst ? items[0]! : null));
  const [error, setError] = useState<string | null>(null);
  const [muting, setMuting] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const made = Object.fromEntries(items.map((i) => [i.id, URL.createObjectURL(i.file)]));
    setUrls(made);
    return () => Object.values(made).forEach((u) => URL.revokeObjectURL(u));
  }, [fileIds]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    if (items.length === 0) onCancel();
  }, [items.length, onCancel]);

  const media = items.filter((i) => visual(i.kind));
  const others = items.filter((i) => !visual(i.kind));
  const single = media.length === 1 && others.length === 0;
  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => setItems((list) => list.filter((i) => i.id !== id));
  const swap = (id: string, file: File, unmuted?: File) => update(id, { id: crypto.randomUUID(), file, unmuted });
  async function toggleMute(item: Item) {
    setError(null);
    if (item.unmuted) return swap(item.id, item.unmuted);
    setMuting(true);
    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      if (stripAudio(bytes)) swap(item.id, new File([bytes], item.file.name, { type: item.file.type }), item.file);
      else setError(tr.composer.couldNotMute);
    } finally {
      setMuting(false);
    }
  }
  const handlers = (item: Item) => ({
    onToggleSpoiler: () => update(item.id, { spoiler: !item.spoiler }),
    onEdit: () => setEditing(item),
    onToggleMute: () => void toggleMute(item),
    onRemove: () => remove(item.id),
  });
  const send = () =>
    items.length &&
    !muting &&
    onSend(
      items.map(({ file, kind, spoiler }) => ({ file, kind, spoiler })),
      caption,
      ephemeral,
    );

  const title =
    media.length && !others.length
      ? media.length === 1
        ? media[0]!.kind === "image"
          ? tr.composer.sendPhoto
          : tr.composer.sendVideo
        : tr.composer.sendItems(media.length)
      : tr.composer.sendFiles(items.length);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <button aria-label={tr.common.cancel} onClick={onCancel} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl md:rounded-3xl dark:bg-stone-900">
          <div className="flex items-center px-4 pt-4 pb-2">
            <h2 className="flex-1 text-lg font-semibold">{title}</h2>
            <button
              onClick={onCancel}
              aria-label={tr.common.cancel}
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
            {single ? (
              <Preview item={media[0]!} url={urls[media[0]!.id]} large {...handlers(media[0]!)} />
            ) : (
              media.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {media.map((item) => (
                    <Preview key={item.id} item={item} url={urls[item.id]} large={false} {...handlers(item)} />
                  ))}
                </div>
              )
            )}
            {others.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-stone-100 p-2.5 dark:bg-stone-800">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                  <FileText className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.file.name}</span>
                  <span className="block text-xs text-stone-500">{formatBytes(item.file.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={tr.composer.removeNamed(item.file.name)}
                  className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {media.length > 0 && (
              <p className="px-1 text-xs text-stone-500">{tr.composer.spoilerTip}</p>
            )}
            {error && (
              <p role="alert" className="px-1 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-sm text-stone-500">{tr.composer.selfDestructAfterViewing}</span>
              <EphemeralPicker value={ephemeral} onChange={setEphemeral} />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4"
          >
            <textarea
              ref={input}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  window.matchMedia("(pointer: fine)").matches &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={tr.composer.addCaption}
              aria-label={tr.composer.caption}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-stone-100 px-4 py-2 text-[16px] leading-6 outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
            />
            <button
              type="submit"
              disabled={muting}
              aria-label={tr.common.send}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95 disabled:opacity-50"
            >
              <SendHorizontal className="size-5" strokeWidth={2.2} />
            </button>
          </form>
        </div>
      </div>
      {editing && (
        <PhotoEditor
          file={editing.file}
          onCancel={() => setEditing(null)}
          onDone={(file) => {
            setEditing(null);
            swap(editing.id, file);
          }}
        />
      )}
    </Portal>
  );
}
