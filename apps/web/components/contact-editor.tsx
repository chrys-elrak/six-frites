"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Shuffle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateContact } from "@/lib/actions";
import { suggestAvatars } from "@/lib/avatar-suggestions";
import { toAvatarDataUrl, urlToAvatarDataUrl } from "@/lib/image";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { PrimaryButton } from "./ui";
import { Portal } from "./portal";
import { ReportDialog } from "./report-dialog";
import { SafetyNumber } from "./safety-number";

export function ContactEditor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const contact = useQuery({
    queryKey: ["contact", userId],
    queryFn: async () => unwrap(await six.api.GET("/v1/contacts/{userId}", { params: { path: { userId } } })),
  });
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const shuffle = () =>
    void suggestAvatars()
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  useEffect(shuffle, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (contact.data && name === null) setName(contact.data.customName ?? "");
  }, [contact.data, name]);

  const c = contact.data;
  const shownPhoto = photo === undefined ? (c?.user.avatarUrl ?? null) : photo === null ? null : photo;
  const hasCustomPhoto = photo === undefined ? !!c?.hasCustomPhoto : photo !== null;

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      setPhoto(await toAvatarDataUrl(f));
      setPicked(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    }
  }

  async function choose(src: string) {
    setError(null);
    try {
      setPhoto(await urlToAvatarDataUrl(src));
      setPicked(src);
    } catch {
      setError("Couldn't use that picture.");
    }
  }

  async function save() {
    if (!c) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = (name ?? "").trim();
      await updateContact(qc, userId, {
        displayName: trimmed && trimmed !== c.originalName ? trimmed : null,
        ...(photo !== undefined && { photo }),
      });
      onClose();
    } catch (err) {
      setError(err instanceof SixApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        role="dialog"
        aria-modal
        aria-label="Edit contact"
      >
        <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900">
          <div className="mb-4 flex items-center">
            <h2 className="flex-1 text-lg font-semibold">Edit contact</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>

          {!c ? (
            <p className="py-8 text-center text-sm text-stone-500">
              {contact.isError ? "Contact not found." : "Loading…"}
            </p>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => file.current?.click()}
                  className="group relative rounded-full"
                  aria-label="Choose a photo"
                >
                  <Avatar user={{ displayName: name || c.originalName, avatarUrl: shownPhoto }} size="lg" />
                  <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
                    <Camera className="size-6" />
                  </span>
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void pick(e.target.files?.[0])}
                />
                {hasCustomPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      setPicked(null);
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="size-4" /> Remove photo
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">Or pick a picture</span>
                    <button
                      type="button"
                      onClick={shuffle}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-brand/10"
                    >
                      <Shuffle className="size-4" /> Shuffle
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {suggestions.map((src) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => void choose(src)}
                        aria-label="Use this picture"
                        aria-pressed={picked === src}
                        className={`aspect-square overflow-hidden rounded-full ring-offset-2 transition hover:scale-105 dark:ring-offset-stone-900 ${
                          picked === src ? "ring-2 ring-brand" : ""
                        }`}
                      >
                        <img src={src} alt="" className="size-full" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">Name</span>
                <input
                  value={name ?? ""}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={c.originalName}
                  maxLength={64}
                  className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
                />
                <span className="flex items-center justify-between text-xs text-stone-500">
                  Only you see this.
                  {name && (
                    <button type="button" onClick={() => setName("")} className="font-medium text-brand">
                      Use their name
                    </button>
                  )}
                </span>
              </label>

              <SafetyNumber userId={userId} name={c.originalName} />

              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <PrimaryButton type="submit" disabled={saving} className="w-full">
                {saving ? "Saving…" : "Save"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="block w-full text-center text-sm font-medium text-red-600 dark:text-red-400"
              >
                Report {c.originalName}
              </button>
            </form>
          )}
          {reporting && (
            <ReportDialog
              target={{ userId }}
              title={`Report ${contact.data?.originalName ?? "this person"}`}
              onClose={() => setReporting(false)}
            />
          )}
        </div>
      </div>
    </Portal>
  );
}
