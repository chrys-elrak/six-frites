"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { e2ee, useIdentityChanges } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";

export function SafetyNumber({ userId, name }: { userId: string; name: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const dismiss = useIdentityChanges((s) => s.dismiss);
  const number = useQuery({
    queryKey: ["safety-number", userId],
    queryFn: async () => {
      const client = e2ee();
      if (!client) throw new Error("Encryption is not ready");
      return client.safetyNumber(userId);
    },
    enabled: open,
  });

  return (
    <div className="rounded-xl bg-stone-100 dark:bg-stone-800">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          dismiss(userId);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
      >
        <ShieldCheck className="size-4 text-brand" />
        <span className="flex-1">{tr.chat.verifyEncryption}</span>
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {tr.chat.compareNumbers(name)}
          </p>
          {number.data ? (
            <p className="grid grid-cols-4 gap-x-3 gap-y-1 font-mono text-[15px] tracking-wider tabular-nums">
              {number.data.match(/\d{5}/g)?.map((group, i) => (
                <span key={i}>{group}</span>
              ))}
            </p>
          ) : (
            <p className="text-sm text-stone-500">
              {number.isError ? tr.chat.noEncryption(name) : tr.common.loading}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
