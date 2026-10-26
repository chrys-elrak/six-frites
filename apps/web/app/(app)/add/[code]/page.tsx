"use client";

import { unwrap } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { use } from "react";
import { FoundUser, findErrorText } from "@/components/found-user";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";

export default function AddPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const tr = useT();
  const find = useQuery({
    queryKey: ["find", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/users/find", { params: { query: { q: code } } })),
    retry: false,
  });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {find.isPending && <p className="text-sm text-stone-500">{tr.common.loading}</p>}
      {find.isError && (
        <>
          <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
            <SearchX className="size-8" strokeWidth={1.6} />
          </span>
          <p className="text-sm text-stone-500">{findErrorText(find.error, tr)}</p>
        </>
      )}
      {find.data && <FoundUser found={find.data} query={code} />}
    </main>
  );
}
