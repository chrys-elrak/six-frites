"use client";

import { SixApiError } from "@six/sdk";
import type { Dict } from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { e2ee } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { CodeInput } from "./privacy-code";
import { Card, PrimaryButton, SectionTitle } from "./ui";

export const recoveryKeyQuery = ["recovery-key"] as const;

export function useHasRecoveryKey() {
  const backupKeyId = useSession((s) => s.user?.backupKeyId ?? null);
  return useQuery({
    queryKey: [...recoveryKeyQuery, backupKeyId],
    queryFn: async () => (await e2ee()?.hasRecoveryKey(backupKeyId)) ?? false,
  });
}

export function EncryptionSettings() {
  const tr = useT();
  const bp = tr.settings.backupPin;
  const user = useSession((s) => s.user)!;
  const hasKey = useHasRecoveryKey();
  const [dialog, setDialog] = useState<"pin" | "restore" | "words" | null>(null);

  const legacy = user.backupKeyId !== null && !user.hasBackupPin;
  const status = hasKey.data
    ? user.hasBackupPin
      ? bp.on
      : bp.noPin
    : user.hasBackupPin
      ? bp.locked
      : legacy
        ? tr.settings.keyOnAccount
        : bp.noPin;
  const primary = "rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";
  const secondary = "rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800";

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.encryption}</SectionTitle>
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          {hasKey.data ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">{bp.title}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">{status}</p>
          </div>
          {!hasKey.isPending && (
            <div className="flex flex-wrap gap-1">
              {hasKey.data ? (
                <button onClick={() => setDialog("pin")} className={primary}>
                  {user.hasBackupPin ? bp.change : bp.create}
                </button>
              ) : user.hasBackupPin ? (
                <>
                  <button onClick={() => setDialog("restore")} className={primary}>
                    {bp.enter}
                  </button>
                  <button onClick={() => setDialog("pin")} className={secondary}>
                    {bp.forgot}
                  </button>
                </>
              ) : legacy ? (
                <>
                  <button onClick={() => setDialog("words")} className={primary}>
                    {tr.settings.enterRecoveryKey}
                  </button>
                  <button onClick={() => setDialog("pin")} className={secondary}>
                    {tr.settings.lostKey}
                  </button>
                </>
              ) : (
                <button onClick={() => setDialog("pin")} className={primary}>
                  {bp.create}
                </button>
              )}
            </div>
          )}
        </div>
      </Card>
      {(dialog === "pin" || dialog === "restore") && (
        <PinDialog restoring={dialog === "restore"} onClose={() => setDialog(null)} />
      )}
      {dialog === "words" && <RestoreKeyDialog onClose={() => setDialog(null)} />}
    </section>
  );
}

/**
 * Shows the PIN dialog once per visit when this device can't read past messages but a PIN would
 * fix it, or when there is no backup yet. Never offers a new PIN on a device without the key while
 * the account has one, since that would start over and lose the old backup.
 */
export function BackupPinPrompt() {
  const user = useSession((s) => s.user)!;
  const hasKey = useHasRecoveryKey();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || hasKey.isPending || hasKey.isError) return null;
  const restoring = !hasKey.data && user.hasBackupPin;
  const creating = !user.hasBackupPin && (hasKey.data || !user.backupKeyId);
  if (!restoring && !creating) return null;
  return <PinDialog restoring={restoring} prompted onClose={() => setDismissed(true)} />;
}

function pinError(err: unknown, tr: Dict) {
  if (!(err instanceof SixApiError)) return tr.common.somethingWrongRetry;
  if (err.code === "WRONG_BACKUP_PIN") return tr.settings.backupPin.wrong((err.details as { triesLeft: number }).triesLeft);
  if (err.code === "BACKUP_PIN_NOT_SET") return tr.settings.backupPin.notSet;
  return tr.settings.appLock.errors[err.code] ?? tr.common.somethingWrongRetry;
}

/** Asks for the backup PIN to restore past messages, or for a new PIN to protect them. */
function PinDialog({ restoring: initial, prompted, onClose }: { restoring: boolean; prompted?: boolean; onClose: () => void }) {
  const tr = useT();
  const bp = tr.settings.backupPin;
  const qc = useQueryClient();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const hasKey = useHasRecoveryKey().data === true;
  const [restoring, setRestoring] = useState(initial);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const client = e2ee();
      if (!client) throw new Error("Encryption is not ready");
      if (restoring) await client.unlockWithPin(pin);
      else setUser(await client.setBackupPin(pin));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: recoveryKeyQuery });
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["chats"] });
      onClose();
    },
    onError: async (err) => {
      setPin("");
      const gone =
        err instanceof SixApiError &&
        (err.code === "BACKUP_PIN_NOT_SET" || (err.details as { triesLeft?: number } | undefined)?.triesLeft === 0);
      if (!gone) return;
      setRestoring(false);
      const { data } = await six.api.GET("/v1/me");
      if (data) setUser(data);
    },
  });
  const ready = pin.length === 6 && (restoring || again === pin);
  const mismatch = !restoring && again.length === 6 && again !== pin;
  const title = restoring ? bp.restoreTitle : hasKey && user.hasBackupPin ? bp.changeTitle : bp.createTitle;

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !save.isPending) save.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">{restoring ? bp.restoreHint : bp.createHint}</p>
        {!restoring && !hasKey && user.backupKeyId && (
          <p className="text-sm text-red-600 dark:text-red-400">{bp.newBackupWarning}</p>
        )}
        <CodeInput key={String(restoring)} label={bp.pin} value={pin} onChange={(v) => setPin(v.slice(0, 6))} autoFocus />
        {!restoring && <CodeInput label={bp.again} value={again} onChange={(v) => setAgain(v.slice(0, 6))} />}
        {(save.isError || mismatch) && (
          <p className="text-sm text-red-600 dark:text-red-400">{save.isError ? pinError(save.error, tr) : bp.mismatch}</p>
        )}
        {restoring && (
          <button
            type="button"
            onClick={() => {
              setRestoring(false);
              setPin("");
              save.reset();
            }}
            className="text-sm text-stone-500 underline-offset-2 hover:underline"
          >
            {bp.forgot}
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            {prompted ? bp.later : tr.common.cancel}
          </button>
          <PrimaryButton type="submit" className="flex-1" disabled={!ready || save.isPending}>
            {restoring ? bp.restore : tr.common.save}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

function RestoreKeyDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const backupKeyId = useSession((s) => s.user!.backupKeyId);
  const [words, setWords] = useState("");
  const restore = useMutation({
    mutationFn: async () => {
      const client = e2ee();
      if (!client) throw new Error("Encryption is not ready");
      await client.restoreRecoveryKey(words.trim().toLowerCase().split(/\s+/).join(" "), backupKeyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: recoveryKeyQuery });
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["chats"] });
      onClose();
    },
  });
  const code = restore.error instanceof SixApiError ? restore.error.code : (restore.error as { code?: string })?.code;

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (words.trim()) restore.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">{tr.settings.enterYourRecoveryKey}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">{tr.settings.restoreHint}</p>
        <textarea
          value={words}
          onChange={(e) => {
            setWords(e.target.value);
            restore.reset();
          }}
          rows={4}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl bg-stone-100 p-3 font-mono text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-stone-800"
        />
        {restore.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {(code && tr.settings.restoreErrors[code]) ?? tr.settings.couldNotUseKey}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            {tr.common.cancel}
          </button>
          <PrimaryButton type="submit" className="flex-1" disabled={!words.trim() || restore.isPending}>
            {tr.settings.unlock}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
