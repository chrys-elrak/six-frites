"use client";

import { randomAlias } from "@six/shared";
import { unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Avatar } from "@/components/avatar";
import { NicknameFields, groupError } from "@/components/groups";
import { PrimaryButton } from "@/components/ui";
import { joinGroup } from "@/lib/groups";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";

export default function JoinGroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const preview = useQuery({
    queryKey: ["group-preview", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/groups/join/{code}", { params: { path: { code } } })),
    retry: false,
  });
  const [nickname, setNickname] = useState(randomAlias);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const chat = await joinGroup(qc, code, { nickname: nickname.trim(), ...(photo && { photo }) });
      router.replace(`/chats/${chat.id}`);
    } catch (err) {
      setError(groupError(err, tr));
      setJoining(false);
    }
  }

  const g = preview.data;
  const closed = g && !g.chatId && (g.banned || g.full);
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 overflow-y-auto px-4 py-6">
      {preview.isPending && <p className="text-center text-sm text-stone-500">{tr.common.loading}</p>}
      {preview.isError && (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
            <Users className="size-8" strokeWidth={1.6} />
          </span>
          <p className="text-sm text-stone-500">{groupError(preview.error, tr)}</p>
        </div>
      )}
      {g && (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar user={{ displayName: g.title, avatarUrl: g.photoUrl }} size="xl" />
            <h1 className="text-xl font-semibold break-words">{g.title}</h1>
            <p className="text-sm text-stone-500">{tr.groups.membersOf(g.memberCount, g.maxMembers)}</p>
            {g.description && <p className="text-sm whitespace-pre-line break-words">{g.description}</p>}
          </div>
          {g.chatId ? (
            <PrimaryButton onClick={() => router.replace(`/chats/${g.chatId}`)}>{tr.groups.open}</PrimaryButton>
          ) : closed ? (
            <p className="text-center text-sm text-stone-500">{g.banned ? tr.groups.banned : tr.groups.full}</p>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <NicknameFields nickname={nickname} photo={photo} onNickname={setNickname} onPhoto={setPhoto} />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <PrimaryButton type="submit" disabled={joining || !nickname.trim()} className="w-full">
                {joining ? tr.common.loading : tr.groups.join}
              </PrimaryButton>
            </form>
          )}
        </>
      )}
    </main>
  );
}
