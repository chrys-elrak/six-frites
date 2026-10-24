"use client";

import { STICKER_LIMITS, type StickerDTO } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { STICKER_ACCEPT, addStickers, createPack, removeSticker, setPackSaved, useStickerPack } from "@/lib/stickers";
import { Dialog } from "./dialog";
import { StickerView } from "./sticker";
import { PrimaryButton } from "./ui";

const field = "block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800 md:text-sm";

function UploadForm({
  withTitle,
  label,
  onSubmit,
}: {
  withTitle: boolean;
  label: string;
  onSubmit: (title: string, files: File[], emoji: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [emoji, setEmoji] = useState("🙂");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(title.trim(), files, emoji.trim());
          setFiles([]);
        } catch (err) {
          setError((err as Error).message || "Something went wrong. Try again.");
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-3 p-4"
    >
      {withTitle && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pack name"
          aria-label="Pack name"
          maxLength={64}
          required
          className={field}
        />
      )}
      <input
        type="file"
        accept={STICKER_ACCEPT}
        multiple
        onChange={(e) => setFiles([...(e.target.files ?? [])])}
        aria-label="Sticker files"
        className="block w-full text-sm"
      />
      <p className="text-xs text-stone-500">Telegram .tgs, Lottie .json, or WebP/PNG images, 512 KB each at most.</p>
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label="Emoji for these stickers"
          maxLength={16}
          required
          className={`${field} w-20 text-center`}
        />
        <PrimaryButton type="submit" disabled={busy || (!withTitle && files.length === 0)} className="flex-1">
          {busy ? "Uploading…" : label}
        </PrimaryButton>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
      <h2 className="flex-1 truncate font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function NewPackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (packId: string) => void }) {
  const qc = useQueryClient();
  return (
    <Dialog onClose={onClose}>
      <Header title="New sticker pack" onClose={onClose} />
      <UploadForm
        withTitle
        label="Create"
        onSubmit={async (title, files, emoji) => {
          const pack = await createPack(qc, title);
          await addStickers(qc, pack.id, files, emoji);
          onCreated(pack.id);
        }}
      />
    </Dialog>
  );
}

export function PackDialog({
  packId,
  onClose,
  onSend,
}: {
  packId: string;
  onClose: () => void;
  onSend?: (sticker: StickerDTO) => void;
}) {
  const qc = useQueryClient();
  const pack = useStickerPack(packId);
  const p = pack.data;
  const full = !!p && p.stickers.length >= STICKER_LIMITS.perPack;

  return (
    <Dialog onClose={onClose}>
      <Header title={p?.title ?? "Stickers"} onClose={onClose} />
      {pack.isPending ? (
        <p className="p-6 text-center text-sm text-stone-500">Loading…</p>
      ) : !p ? (
        <p className="p-6 text-center text-sm text-stone-500">This sticker pack is no longer available.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 p-3">
            {p.stickers.map((s) => (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!onSend) return;
                    onSend(s);
                    onClose();
                  }}
                  className="grid w-full place-items-center rounded-xl p-1 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <StickerView sticker={s} size={72} still />
                </button>
                {p.mine && (
                  <button
                    type="button"
                    onClick={() => void removeSticker(qc, p.id, s.id).catch(() => null)}
                    aria-label={`Remove ${s.emoji} sticker`}
                    className="absolute top-0 right-0 grid size-6 place-items-center rounded-full bg-stone-900/70 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {p.stickers.length === 0 && (
              <p className="col-span-4 py-6 text-center text-sm text-stone-500">No stickers yet.</p>
            )}
          </div>
          {p.mine
            ? !full && (
                <UploadForm
                  withTitle={false}
                  label="Add stickers"
                  onSubmit={(_, files, emoji) => addStickers(qc, p.id, files, emoji)}
                />
              )
            : !p.builtin && (
                <div className="p-4 pt-0">
                  <PrimaryButton
                    type="button"
                    onClick={() => void setPackSaved(qc, p.id, !p.saved).catch(() => null)}
                    className="w-full"
                  >
                    {p.saved ? "Remove from my stickers" : "Add to my stickers"}
                  </PrimaryButton>
                </div>
              )}
        </>
      )}
    </Dialog>
  );
}
