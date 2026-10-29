"use client";

import { unwrap } from "@six/sdk";
import { MAX_CONTACT_LINKS } from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { contactUrl, formatCode, sendAtLabel, shareContact } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { QrCode } from "./qr-code";
import { ScheduleDialog } from "./scheduled";
import { Sheet } from "./sheet";
import { Card, SectionTitle } from "./ui";

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

export function FindMe() {
  const tr = useT();
  const qc = useQueryClient();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
  const create = useMutation({
    mutationFn: async (expiresAt: Date | null) =>
      unwrap(await six.api.POST("/v1/me/contact-links", { body: { expiresAt: expiresAt?.toISOString() ?? null } })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (code: string) =>
      unwrap(await six.api.DELETE("/v1/me/contact-links/{code}", { params: { path: { code } } })),
    onSuccess: refresh,
  });

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
            <button onClick={() => setConfirmReset(true)} disabled={reset.isPending} className={QUIET}>
              {tr.settings.newCode}
            </button>
          </CodeRow>
          <p className="px-4 pb-4 text-sm text-stone-500 dark:text-stone-400">{tr.settings.oneUseHint}</p>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>{tr.settings.reusableCodes}</SectionTitle>
        <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
          <p className="p-4 text-sm text-stone-500 dark:text-stone-400">{tr.settings.reusableHint}</p>
          {items.length > 0 && (
            <div className="divide-y divide-stone-200 lg:max-h-80 lg:overflow-y-auto lg:overscroll-contain dark:divide-stone-800">
              {items.map((l) => (
                <CodeRow
                  key={l.code}
                  code={l.code}
                  label={l.expiresAt ? tr.settings.worksUntil(sendAtLabel(l.expiresAt)) : tr.settings.worksUntilDeleted}
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
              onClick={() => setChoosing(true)}
              disabled={create.isPending}
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
        {choosing && (
          <Sheet
            title={tr.settings.newReusableCode}
            actions={[
              { label: tr.settings.untilDeleted, onSelect: () => create.mutate(null) },
              { label: tr.settings.untilDate, onSelect: () => setPickingDate(true) },
            ]}
            onClose={() => setChoosing(false)}
          />
        )}
        {pickingDate && (
          <ScheduleDialog
            title={tr.settings.stopsWorking}
            confirm={tr.settings.create}
            initial={new Date(Date.now() + 7 * 864e5)}
            onPick={(at) => {
              setPickingDate(false);
              create.mutate(at);
            }}
            onClose={() => setPickingDate(false)}
          />
        )}
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
