"use client";

import { SixApiError, unwrap } from "@six/sdk";
import type { Dict, FoundUserDTO } from "@six/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { PrimaryButton } from "./ui";

export const findErrorText = (err: unknown, tr: Dict) =>
  err instanceof SixApiError
    ? ((tr.contacts.findErrors as Record<string, string | undefined>)[err.code] ?? err.message)
    : tr.common.somethingWrong;

export function FoundUser({ found, query, onAdded }: { found: FoundUserDTO; query: string; onAdded?: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();

  const add = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/contacts", { body: { q: query } })),
    onSuccess: (contact) => {
      onAdded?.();
      router.push(`/chats/${contact.chatId}`);
    },
  });

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Avatar user={found.user} size="lg" />
      <div>
        <p className="text-lg font-semibold">{found.user.displayName}</p>
        {found.username && <p className="text-sm text-stone-500">@{found.username}</p>}
      </div>
      <PrimaryButton className="w-full" onClick={() => add.mutate()} disabled={add.isPending}>
        {found.chatId ? tr.contacts.openChat : tr.common.message}
      </PrimaryButton>
      {add.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {findErrorText(add.error, tr)}
        </p>
      )}
    </div>
  );
}
