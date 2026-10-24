"use client";

import { unwrap } from "@six/sdk";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, QrCode, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { six } from "@/lib/six";
import { FoundUser, findErrorText } from "./found-user";
import { Portal } from "./portal";
import { QrScanner, canScanQr } from "./qr-scanner";

export function AddContact({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);

  const find = useMutation({
    mutationFn: async (q: string) => ({
      q,
      found: unwrap(await six.api.GET("/v1/users/find", { params: { query: { q } } })),
    }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onScan = useCallback(
    (value: string) => {
      setScanning(false);
      setQuery(value);
      find.mutate(value);
    },
    [find.mutate],
  );

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
        role="dialog"
        aria-modal
        aria-label="Add contact"
      >
        <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="relative w-full max-w-sm space-y-4 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5 dark:bg-stone-900">
          <div className="flex items-center gap-1">
            {scanning && (
              <button
                onClick={() => setScanning(false)}
                aria-label="Back"
                className="-ml-2 grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <h2 className="flex-1 text-lg font-semibold">{scanning ? "Scan a QR code" : "Add contact"}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>

          {scanning ? (
            <QrScanner onScan={onScan} />
          ) : (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) find.mutate(query.trim());
                }}
              >
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-stone-500 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-800">
                  <Search className="size-4 shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      find.reset();
                    }}
                    placeholder="Code, @username or email"
                    aria-label="Contact code, username or email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-stone-900 outline-none placeholder:text-stone-500 dark:text-stone-100"
                  />
                </label>
                {canScanQr() && (
                  <button
                    type="button"
                    onClick={() => setScanning(true)}
                    aria-label="Scan a QR code"
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                  >
                    <QrCode className="size-5" />
                  </button>
                )}
              </form>

              {find.isPending && <p className="py-4 text-center text-sm text-stone-500">Searching…</p>}
              {find.isError && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  {findErrorText(find.error)}
                </p>
              )}
              {find.data && <FoundUser found={find.data.found} query={find.data.q} onAdded={onClose} />}
              {find.isIdle && (
                <p className="text-sm text-stone-500">
                  Ask for their contact code or QR code, which they can find in Settings. You can also type their @username
                  or email.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
