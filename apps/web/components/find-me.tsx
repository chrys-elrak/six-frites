"use client";

import { SixApiError, unwrap } from "@six/sdk";
import { CONTACT_LINK_DAYS, MAX_CONTACT_LINK_USES, MAX_CONTACT_LINKS } from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { contactUrl, formatCode, sendAtLabel, shareContact } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { QrCode } from "./qr-code";
import { Sheet } from "./sheet";
import { Card, PrimaryButton, SectionTitle } from "./ui";

const SOFT = "rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";
const QUIET = "rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800";

function CodeRow({ code, label, children }: { code: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 p-4">
      <QrCode value={contactUrl(code)} className="size-28 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm text-stone-500 dark:text-stone-400">{label}</p>
          <p className="font-mono text-xl font-semibold tracking-widest">{formatCode(code)}</p>
        </div>
        <div className="flex flex-wrap gap-1">{children}</div>
      </div>
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function NewContactLinkDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [days, setDays] = useState(CONTACT_LINK_DAYS);
  const [people, setPeople] = useState(0);
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await six.api.POST("/v1/me/contact-links", {
          body: { expiresAt: new Date(Date.now() + days * 864e5).toISOString(), maxUses: people || null },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contact-links"] });
      onClose();
    },
  });
  const select = "rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800";

  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">{tr.settings.newReusableCode}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr.common.close}
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="space-y-4 p-4"
      >
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{tr.settings.linkPeople}</span>
          <select value={people} onChange={(e) => setPeople(Number(e.target.value))} className={select}>
            <option value={0}>{tr.settings.noLimit}</option>
            {range(MAX_CONTACT_LINK_USES).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{tr.settings.inviteValidFor}</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={select}>
            {range(CONTACT_LINK_DAYS).map((n) => (
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
          {tr.settings.create}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}

export function FindMe() {
  const tr = useT();
  const qc = useQueryClient();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [copied, setCopied] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void six.api.GET("/v1/me").then(({ data }) => data && setUser(data));
  }, [setUser]);

  const reset = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/me/contact-code")),
    onSuccess: setUser,
  });

  const links = useQuery({
    queryKey: ["contact-links"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/contact-links")).items,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contact-links"] });
  const remove = useMutation({
    mutationFn: async (code: string) =>
      unwrap(await six.api.DELETE("/v1/me/contact-links/{code}", { params: { path: { code } } })),
    onSuccess: refresh,
  });

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(formatCode(code));
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  async function share(code: string) {
    if ((await shareContact(code)) === "copied") {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  if (!user.contactCode) return null;
  const items = links.data ?? [];

  return (
    <>
      <section className="space-y-3">
        <SectionTitle>{tr.settings.findMe}</SectionTitle>
        <Card className="overflow-hidden">
          <CodeRow code={user.contactCode} label={tr.settings.contactCode}>
            <button onClick={() => void share(user.contactCode)} className={SOFT}>
              {copied === user.contactCode ? tr.settings.linkCopied : tr.common.shareLink}
            </button>
            <button onClick={() => void copyCode(user.contactCode)} className={SOFT}>
              {codeCopied ? tr.common.copied : tr.settings.copyCode}
            </button>
            <button onClick={() => setConfirmReset(true)} disabled={reset.isPending} className={QUIET}>
              {tr.settings.newCode}
            </button>
          </CodeRow>
          <p className="px-4 pb-4 text-sm text-stone-500 dark:text-stone-400">{tr.settings.oneUseHint}</p>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>{tr.settings.reusableCodes}</SectionTitle>
        <Card className="divide-y divide-surface-line overflow-hidden">
          <p className="p-4 text-sm text-stone-500 dark:text-stone-400">{tr.settings.reusableHint}</p>
          {items.length > 0 && (
            <div className="divide-y divide-surface-line lg:max-h-80 lg:overflow-y-auto lg:overscroll-contain">
              {items.map((l) => (
                <CodeRow
                  key={l.code}
                  code={l.code}
                  label={[
                    tr.settings.worksUntil(sendAtLabel(l.expiresAt)),
                    l.maxUses !== null && tr.settings.addedOf(l.uses, l.maxUses),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <button onClick={() => void share(l.code)} className={SOFT}>
                    {copied === l.code ? tr.settings.linkCopied : tr.common.shareLink}
                  </button>
                  <button onClick={() => setDeleting(l.code)} className={QUIET}>
                    {tr.common.delete}
                  </button>
                </CodeRow>
              ))}
            </div>
          )}
          {items.length < MAX_CONTACT_LINKS && (
            <button
              onClick={() => setCreating(true)}
              className="w-full p-4 text-left text-sm font-semibold text-orange-600 hover:bg-stone-50 dark:text-orange-400 dark:hover:bg-stone-800/50"
            >
              {tr.settings.newReusableCode}
            </button>
          )}
        </Card>

        {confirmReset && (
          <Sheet
            title={tr.settings.resetCodeWarning}
            actions={[{ label: tr.settings.getNewCode, destructive: true, onSelect: () => reset.mutate() }]}
            onClose={() => setConfirmReset(false)}
          />
        )}
        {creating && <NewContactLinkDialog onClose={() => setCreating(false)} />}
        {deleting && (
          <Sheet
            title={tr.settings.deleteCodeWarning}
            actions={[{ label: tr.common.delete, destructive: true, onSelect: () => remove.mutate(deleting) }]}
            onClose={() => setDeleting(null)}
          />
        )}
      </section>
    </>
  );
}
