"use client";

import { unwrap } from "@six/sdk";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { six, useStorageFull } from "@/lib/six";
import { Sheet } from "./sheet";

export function StorageFullPrompt() {
  const tr = useT();
  const router = useRouter();
  const open = useStorageFull((s) => s.open);
  const [confirming, setConfirming] = useState(false);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (confirming) {
    return (
      <Sheet
        title={tr.messages.deleteMyFilesConfirm}
        onClose={() => setConfirming(false)}
        actions={[
          {
            label: tr.messages.deleteMyFiles,
            destructive: true,
            onSelect: () => void run(async () => void unwrap(await six.api.DELETE("/v1/me/uploads"))),
          },
        ]}
      />
    );
  }
  if (!open) return null;
  return (
    <Sheet
      title={
        <>
          <span className="block font-semibold text-stone-900 dark:text-stone-100">{tr.messages.storageFull}</span>
          {tr.messages.storageFullBody}
        </>
      }
      onClose={() => useStorageFull.setState({ open: false })}
      actions={[
        {
          label: tr.support.contact,
          onSelect: () => void run(async () => router.push(`/chats/${unwrap(await six.api.POST("/v1/support")).id}`)),
        },
        { label: tr.messages.deleteMyFiles, destructive: true, onSelect: () => setConfirming(true) },
      ]}
    />
  );
}
