"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Shuffle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateContact } from "@/lib/actions";
import { suggestAvatars } from "@/lib/avatar-suggestions";
import { useT } from "@/lib/i18n";
import { toAvatarDataUrl, urlToAvatarDataUrl } from "@/lib/image";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { CodeInput, codeError } from "./privacy-code";
import { PrimaryButton, Toggle } from "./ui";
import { Portal } from "./portal";
import { ReportDialog } from "./report-dialog";
import { SafetyNumber } from "./safety-number";

export function ContactEditor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const tr = useT();
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
  const hasCode = useSession((s) => s.user!.hasContactPin);
  const [unlocking, setUnlocking] = useState(false);
  const [pin, setPin] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const share = useMutation({
    mutationFn: async (shared: boolean) =>
      unwrap(await six.api.PUT("/v1/contacts/{userId}/profile", { params: { path: { userId } }, body: { shared } })),
    onSuccess: (dto) => qc.setQueryData(["contact", userId], dto),
  });

  async function reveal() {
    setRevealError(null);
    try {
      const { originalName } = unwrap(
        await six.api.POST("/v1/contacts/{userId}/reveal", { params: { path: { userId } }, body: { pin } }),
      );
      setRevealed(originalName);
      setUnlocking(false);
    } catch (err) {
      setRevealError(codeError(err, tr));
    }
  }

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
      setError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  async function choose(src: string) {
    setError(null);
    try {
      setPhoto(await urlToAvatarDataUrl(src));
      setPicked(src);
    } catch {
      setError(tr.contacts.couldNotUsePicture);
    }
  }

  async function save() {
    if (!c) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = (name ?? "").trim();
      const showingRealName = !(trimmed && trimmed !== c.originalName);
      if (showingRealName && c.customName && hasCode && !revealed) {
        setUnlocking(true);
        setRevealError(tr.contacts.enterCodeToShow);
        return;
      }
      await updateContact(qc, userId, {
        displayName: showingRealName ? null : trimmed,
        ...(photo !== undefined && { photo }),
        ...(revealed && { pin }),
      });
      onClose();
    } catch (err) {
      setError(err instanceof SixApiError ? err.message : tr.common.couldNotSave);
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
        aria-label={tr.contacts.editContact}
      >
        <button aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900">
          <div className="mb-4 flex items-center">
            <h2 className="flex-1 text-lg font-semibold">{tr.contacts.editContact}</h2>
            <button
              onClick={onClose}
              aria-label={tr.common.close}
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>

          {!c ? (
            <p className="py-8 text-center text-sm text-stone-500">
              {contact.isError ? tr.contacts.notFound : tr.common.loading}
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
                  aria-label={tr.contacts.choosePhoto}
                >
                  <Avatar user={{ displayName: name || c.user.displayName, avatarUrl: shownPhoto }} size="lg" />
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
                    <Trash2 className="size-4" /> {tr.contacts.removePhoto}
                  </button>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">{tr.contacts.orPickPicture}</span>
                    <button
                      type="button"
                      onClick={shuffle}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-brand/10"
                    >
                      <Shuffle className="size-4" /> {tr.contacts.shuffle}
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {suggestions.map((src) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => void choose(src)}
                        aria-label={tr.contacts.usePicture}
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
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">{tr.contacts.name}</span>
                <input
                  value={name ?? ""}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tr.contacts.name}
                  maxLength={64}
                  className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
                />
                <span className="flex items-center justify-between text-xs text-stone-500">
                  {tr.contacts.onlyYouSee}
                  {name && (
                    <button type="button" onClick={() => setName("")} className="font-medium text-brand">
                      {tr.contacts.useTheirName}
                    </button>
                  )}
                </span>
              </label>

              {c.customName && (
                <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/50">
                  {revealed ? (
                    <p>
                      <span className="text-stone-500">{tr.contacts.realName}</span>
                      <span className="font-medium">{revealed}</span>
                    </p>
                  ) : !hasCode ? (
                    <p className="text-stone-500">{tr.contacts.realNameHidden}</p>
                  ) : unlocking ? (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <CodeInput
                          label={tr.contacts.privacy.title}
                          value={pin}
                          onChange={setPin}
                          autoFocus
                          onEnter={() => pin.length >= 4 && void reveal()}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void reveal()}
                        disabled={pin.length < 4}
                        className="rounded-xl bg-stone-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:bg-stone-700"
                      >
                        {tr.contacts.show}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setUnlocking(true)} className="font-medium text-brand">
                      {tr.contacts.showRealName}
                    </button>
                  )}
                  {revealError && <p className="text-red-600 dark:text-red-400">{revealError}</p>}
                </div>
              )}

              <div className="overflow-hidden rounded-xl bg-stone-50 dark:bg-stone-800/50">
                <Toggle
                  label={tr.contacts.shareProfile}
                  hint={tr.contacts.shareProfileHint}
                  checked={share.isPending ? !!share.variables : c.sharingProfile}
                  disabled={share.isPending}
                  onChange={(on) => share.mutate(on)}
                />
              </div>

              <SafetyNumber userId={userId} name={c.user.displayName} />

              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <PrimaryButton type="submit" disabled={saving} className="w-full">
                {saving ? tr.common.saving : tr.common.save}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="block w-full text-center text-sm font-medium text-red-600 dark:text-red-400"
              >
                {tr.contacts.report(c.user.displayName)}
              </button>
            </form>
          )}
          {reporting && (
            <ReportDialog
              target={{ userId }}
              title={c ? tr.contacts.report(c.user.displayName) : tr.contacts.reportPerson}
              onClose={() => setReporting(false)}
            />
          )}
        </div>
      </div>
    </Portal>
  );
}
