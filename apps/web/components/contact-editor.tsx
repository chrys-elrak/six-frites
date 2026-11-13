"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { LABEL_MAX, NAME_MAX } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Lock, Shuffle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloseOnBack } from "@/lib/back";
import { updateContact } from "@/lib/actions";
import { suggestAvatars } from "@/lib/avatar-suggestions";
import { useT } from "@/lib/i18n";
import { urlToAvatarDataUrl } from "@/lib/image";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { LockScreen } from "./app-lock";
import { Avatar } from "./avatar";
import { PrimaryButton } from "./ui";
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const hasLock = useSession((s) => s.user!.hasAppLock);
  const [askingCode, setAskingCode] = useState(false);
  const [label, setLabel] = useState<{ code: string; text: string; saved: string } | null>(null);

  const shuffle = () =>
    void suggestAvatars()
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  useEffect(shuffle, []);

  useCloseOnBack(onClose);

  useEffect(() => {
    if (contact.data && name === null) setName(contact.data.customName ?? "");
  }, [contact.data, name]);

  const c = contact.data;
  const shownPhoto = photo === undefined ? (c?.user.avatarUrl ?? null) : photo === null ? null : photo;
  const hasCustomPhoto = photo === undefined ? !!c?.hasCustomPhoto : photo !== null;

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
      if (label && label.text.trim() !== label.saved) {
        unwrap(
          await six.api.PUT("/v1/contacts/{userId}/label", {
            params: { path: { userId } },
            body: { code: label.code, label: label.text.trim() || null },
          }),
        );
      }
      const trimmed = (name ?? "").trim();
      const showingRealName = !(trimmed && trimmed !== c.originalName);
      await updateContact(qc, userId, {
        displayName: showingRealName ? null : trimmed,
        ...(photo !== undefined && { photo }),
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
        <div className="relative max-h-[92dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl bg-white/70 backdrop-blur-xl backdrop-saturate-150 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900/70">
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
                <Avatar user={{ displayName: name || c.user.displayName, avatarUrl: shownPhoto, alias: c.originalName }} size="lg" />
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
                    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">{tr.contacts.pickPicture}</span>
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
                  maxLength={NAME_MAX}
                  className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-800"
                />
                <span className="flex items-center justify-between gap-2 text-xs text-stone-500">
                  <span className="flex-1">{tr.contacts.onlyYouSee}</span>
                  <span className="tabular-nums">
                    {(name ?? "").length}/{NAME_MAX}
                  </span>
                  {name && (
                    <button type="button" onClick={() => setName("")} className="font-medium text-brand">
                      {tr.contacts.useTheirName}
                    </button>
                  )}
                </span>
              </label>

              {c.customName && (
                <p className="rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/50">
                  <span className="text-stone-500">{tr.contacts.realName}</span>
                  <span className="font-medium">{c.originalName}</span>
                </p>
              )}

              <div className="space-y-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/50">
                <p className="flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-stone-300">
                  <Lock className="size-4" /> {tr.contacts.privateLabel}
                </p>
                {label ? (
                  <input
                    autoFocus
                    value={label.text}
                    onChange={(e) => setLabel({ ...label, text: e.target.value })}
                    placeholder={tr.contacts.labelPlaceholder}
                    maxLength={LABEL_MAX}
                    className="w-full rounded-xl bg-white px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-brand dark:bg-stone-900"
                  />
                ) : null}
                {label ? (
                  <p className="text-right text-xs text-stone-500 tabular-nums">
                    {label.text.length}/{LABEL_MAX}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-stone-500">{hasLock ? tr.contacts.privateLabelHint : tr.contacts.needAppLock}</p>
                    {hasLock ? (
                      <button type="button" onClick={() => setAskingCode(true)} className="text-sm font-medium text-brand">
                        {tr.contacts.openLabel}
                      </button>
                    ) : (
                      <Link href="/settings#app-lock" className="text-sm font-medium text-brand">
                        {tr.settings.appLock.turnOnTitle}
                      </Link>
                    )}
                  </>
                )}
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

              <button
                type="button"
                onClick={() => setReporting(true)}
                className="block w-full text-center text-sm font-medium text-red-600 dark:text-red-400"
              >
                {tr.contacts.report(c.user.displayName)}
              </button>
              <div className="sticky -bottom-5 -mx-5 border-t border-black/5 bg-white/90 px-5 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/90">
                <PrimaryButton type="submit" disabled={saving} className="w-full">
                  {saving ? tr.common.saving : tr.common.save}
                </PrimaryButton>
              </div>
            </form>
          )}
          {askingCode && (
            <LockScreen
              title={tr.contacts.privateLabel}
              onCancel={() => setAskingCode(false)}
              onUnlock={() => setAskingCode(false)}
              check={async (code) => {
                const res = unwrap(
                  await six.api.POST("/v1/contacts/{userId}/label", { params: { path: { userId } }, body: { code } }),
                );
                setLabel({ code, text: res.label ?? "", saved: res.label ?? "" });
              }}
            />
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
