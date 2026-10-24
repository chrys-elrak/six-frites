"use client";

import { SixApiError, unwrap } from "@six/sdk";
import type { FoundUserDTO } from "@six/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { PrimaryButton } from "./ui";

export const findErrors: Record<string, string> = {
  USER_NOT_FOUND: "No one matches that code, username or email.",
  CONTACT_SELF: "That's you.",
  RATE_LIMITED: "Too many searches. Wait a minute and try again.",
};

export const findErrorText = (err: unknown) =>
  err instanceof SixApiError ? (findErrors[err.code] ?? err.message) : "Something went wrong.";

export function FoundUser({ found, query, onAdded }: { found: FoundUserDTO; query: string; onAdded?: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();

  const add = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/contacts", { body: { q: query } })),
    onSuccess: (contact) => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
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
        {found.chatId ? "Open chat" : "Message"}
      </PrimaryButton>
      {add.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {findErrorText(add.error)}
        </p>
      )}
    </div>
  );
}
