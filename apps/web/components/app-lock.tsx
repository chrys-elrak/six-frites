"use client";

import { unwrap } from "@six/sdk";
import { useMutation } from "@tanstack/react-query";
import { Delete, Lock } from "lucide-react";
import { useState } from "react";
import { unlock } from "@/lib/app-lock";
import { signOut } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Dialog } from "./dialog";
import { useHasRecoveryKey } from "./encryption-settings";
import { Logo } from "./logo";
import { Sheet } from "./sheet";
import { Card, CodeInput, PrimaryButton, SectionTitle, codeError } from "./ui";

export function AppLockSettings() {
  const tr = useT();
  const hasLock = useSession((s) => s.user!.hasAppLock);
  const setUser = useSession((s) => s.setUser);
  const [turningOn, setTurningOn] = useState(false);
  const turnOff = useMutation({
    mutationFn: async () => unwrap(await six.api.DELETE("/v1/me/app-lock")),
    onSuccess: setUser,
  });

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.appLock.title}</SectionTitle>
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {hasLock ? tr.settings.appLock.onHint : tr.settings.appLock.offHint}
          </p>
          {turnOff.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">{tr.common.somethingWrongRetry}</p>
          )}
          <button
            onClick={() => (hasLock ? turnOff.mutate() : setTurningOn(true))}
            disabled={turnOff.isPending}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            {hasLock ? tr.settings.appLock.turnOff : tr.settings.appLock.turnOn}
          </button>
        </div>
      </Card>
      {turningOn && <TurnOnDialog onClose={() => setTurningOn(false)} />}
    </section>
  );
}

function TurnOnDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const setUser = useSession((s) => s.setUser);
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const save = useMutation({
    mutationFn: async () => unwrap(await six.api.PUT("/v1/me/app-lock", { body: { code } })),
    onSuccess: (u) => {
      unlock();
      setUser(u);
      onClose();
    },
  });
  const mismatch = again.length >= code.length && again.length > 0 && again !== code;
  const ready = code.length >= 4 && again === code;

  return (
    <Dialog onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) save.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">{tr.settings.appLock.turnOnTitle}</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">{tr.settings.appLock.newCode}</p>
        <CodeInput label={tr.settings.appLock.code} value={code} onChange={setCode} autoFocus />
        <CodeInput label={tr.settings.appLock.again} value={again} onChange={setAgain} />
        {(save.isError || mismatch) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {save.isError ? codeError(save.error, tr, tr.settings.appLock.errors) : tr.settings.appLock.mismatch}
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
          <PrimaryButton type="submit" className="flex-1" disabled={!ready || save.isPending}>
            {tr.settings.appLock.turnOn}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

/** On-screen digits for mouse users; touch screens get the numeric keyboard instead. */
function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tr = useT();
  const key = "grid size-16 place-items-center rounded-full text-2xl font-medium hover:bg-stone-200 active:scale-95 dark:hover:bg-stone-800";

  return (
    <div className="hidden grid-cols-3 justify-items-center gap-3 pointer-fine:grid">
      {[..."123456789", "", "0"].map((d) =>
        d ? (
          <button
            key={d}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange((value + d).slice(0, 8))}
            className={`${key} bg-stone-100 dark:bg-stone-900`}
          >
            {d}
          </button>
        ) : (
          <span key="gap" />
        ),
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(value.slice(0, -1))}
        disabled={!value}
        aria-label={tr.settings.appLock.eraseDigit}
        className={`${key} text-stone-500 disabled:opacity-30`}
      >
        <Delete className="size-6" />
      </button>
    </div>
  );
}

/**
 * Covers the app until the app lock code is entered. Forgetting it means signing out and in again. With
 * `onCancel` it guards a single screen, like the archived chats, and can be backed out of instead.
 */
export function LockScreen({
  title,
  onUnlock = unlock,
  onCancel,
}: {
  title?: string;
  onUnlock?: () => void;
  onCancel?: () => void;
}) {
  const tr = useT();
  const [code, setCode] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const hasKey = useHasRecoveryKey();
  const check = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/me/app-lock/unlock", { body: { code } })),
    onSuccess: () => onUnlock(),
    onError: () => setCode(""),
  });

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-50 p-6 dark:bg-stone-950">
      <form
        className="w-full max-w-xs space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length >= 4) check.mutate();
        }}
      >
        <Logo className="mx-auto size-14" />
        <h1 className="text-center text-xl font-semibold">{title ?? tr.settings.appLock.locked}</h1>
        <CodeInput label={tr.settings.appLock.enterCode} value={code} onChange={setCode} autoFocus />
        <Keypad value={code} onChange={setCode} />
        {check.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {codeError(check.error, tr, tr.settings.appLock.errors)}
          </p>
        )}
        <PrimaryButton type="submit" className="w-full" disabled={code.length < 4 || check.isPending}>
          {tr.settings.appLock.unlock}
        </PrimaryButton>
        <button
          type="button"
          onClick={onCancel ?? (() => setConfirmSignOut(true))}
          className="block w-full text-center text-sm text-stone-500 underline-offset-2 hover:underline"
        >
          {onCancel ? tr.common.cancel : tr.settings.appLock.forgot}
        </button>
      </form>
      {confirmSignOut && (
        <Sheet
          title={hasKey.data ? tr.settings.signOutWithKey : tr.settings.signOutWithoutKey}
          actions={[{ label: tr.settings.signOut, destructive: true, onSelect: () => void signOut() }]}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
    </div>
  );
}
