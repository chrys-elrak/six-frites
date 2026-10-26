"use client";

import { SixApiError } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { e2ee } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { Card, PrimaryButton, SectionTitle } from "./ui";

export const recoveryKeyQuery = ["recovery-key"] as const;

export function useHasRecoveryKey() {
  return useQuery({
    queryKey: recoveryKeyQuery,
    queryFn: async () => (await e2ee()?.hasRecoveryKey()) ?? false,
  });
}

export function EncryptionSettings() {
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const hasKey = useHasRecoveryKey();
  const [dialog, setDialog] = useState<"create" | "restore" | null>(null);

  const accountHasKey = user.backupKeyId !== null;
  const status = hasKey.data
    ? tr.settings.keyOnBrowser
    : accountHasKey
      ? tr.settings.keyOnAccount
      : tr.settings.noKey;

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.encryption}</SectionTitle>
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          {hasKey.data ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">{tr.settings.recoveryKey}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">{status}</p>
          </div>
          {!hasKey.isPending && !hasKey.data && (
            <div className="flex flex-wrap gap-1">
              {accountHasKey && (
                <button
                  onClick={() => setDialog("restore")}
                  className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
                >
                  {tr.settings.enterRecoveryKey}
                </button>
              )}
              <button
                onClick={() => setDialog("create")}
                className={
                  accountHasKey
                    ? "rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                    : "rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
                }
              >
                {accountHasKey ? tr.settings.lostKey : tr.settings.createRecoveryKey}
              </button>
            </div>
          )}
        </div>
      </Card>
      {dialog === "create" && <CreateKeyDialog replacing={accountHasKey} onClose={() => setDialog(null)} />}
      {dialog === "restore" && <RestoreKeyDialog onClose={() => setDialog(null)} />}
    </section>
  );
}

function CreateKeyDialog({ replacing, onClose }: { replacing: boolean; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const setUser = useSession((s) => s.setUser);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: async () => {
      const client = e2ee();
      if (!client) throw new Error("Encryption is not ready");
      const words = await client.createRecoveryKey();
      const { data } = await six.api.GET("/v1/me");
      if (data) setUser(data);
      void qc.invalidateQueries({ queryKey: recoveryKeyQuery });
      return words;
    },
  });
  const words = create.data;

  return (
    <Dialog onClose={() => (!words || saved) && onClose()}>
      <div className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{words ? tr.settings.yourRecoveryKey : tr.settings.createRecoveryKey}</h2>
        {!words ? (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-300">{tr.settings.createIntro}</p>
            {replacing && (
              <p className="text-sm text-red-600 dark:text-red-400">{tr.settings.replaceWarning}</p>
            )}
            {create.isError && <p className="text-sm text-red-600 dark:text-red-400">{tr.settings.couldNotCreateKey}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                {tr.common.cancel}
              </button>
              <PrimaryButton className="flex-1" disabled={create.isPending} onClick={() => create.mutate()}>
                {tr.settings.showWords}
              </PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <ol className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-xl bg-stone-100 p-3 font-mono text-sm dark:bg-stone-800">
              {words.split(" ").map((w, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="w-5 text-right text-stone-400">{i + 1}</span>
                  {w}
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(words);
                setCopied(true);
              }}
              className="w-full rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
            >
              {copied ? tr.common.copied : tr.settings.copyToPasswordManager}
            </button>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5" />
              {tr.settings.savedWordsCheck}
            </label>
            <PrimaryButton className="w-full" disabled={!saved} onClick={onClose}>
              {tr.common.done}
            </PrimaryButton>
          </>
        )}
      </div>
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
