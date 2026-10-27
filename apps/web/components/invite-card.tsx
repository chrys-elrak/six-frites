"use client";

import { unwrap } from "@six/sdk";
import type { InvitePreview } from "@six/shared";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";

export const invitePreviewQuery = (code: string) => ({
  queryKey: ["invite", code],
  queryFn: async () => unwrap(await six.api.GET("/v1/invites/{code}", { params: { path: { code } } })),
  retry: false,
});

export function InviteCard({ invite }: { invite: InvitePreview }) {
  const tr = useT();
  const problem = {
    valid: null,
    expired: tr.auth.inviteExpired,
    exhausted: tr.auth.inviteUsedUp,
    revoked: tr.auth.inviteRevoked,
  }[invite.status];

  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <Avatar user={invite.inviter} size="lg" />
      <h1 className="text-xl font-semibold">{tr.auth.invitedYou(invite.inviter.displayName)}</h1>
      {invite.message && (
        <p className="w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-stone-100 px-4 py-3 text-left text-[15px] dark:bg-stone-800">
          {invite.message}
        </p>
      )}
      {problem && <p className="text-sm text-red-600 dark:text-red-400">{problem}</p>}
    </div>
  );
}
