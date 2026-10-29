"use client";

import { unwrap } from "@six/sdk";
import type { SessionDTO } from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type LucideIcon, Monitor, Smartphone } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { Card, SectionTitle } from "./ui";

const platformIcon: Record<SessionDTO["platform"], LucideIcon> = { web: Monitor, ios: Smartphone, android: Smartphone };

function PlatformIcon({ platform }: { platform: SessionDTO["platform"] }) {
  const Icon = platformIcon[platform];
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500 dark:bg-stone-800">
      <Icon className="size-5" />
    </span>
  );
}

export function Devices() {
  const tr = useT();
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => unwrap(await six.api.GET("/v1/sessions")).items,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => unwrap(await six.api.DELETE("/v1/sessions/{id}", { params: { path: { id } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const revokeOthers = useMutation({
    mutationFn: async () => unwrap(await six.api.DELETE("/v1/sessions")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const others = sessions.data?.filter((s) => !s.current).length ?? 0;

  return (
    <section className="space-y-3">
      <SectionTitle
        action={
          others > 0 && (
            <button
              onClick={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending}
              className="text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-400"
            >
              {tr.settings.logOutOthers}
            </button>
          )
        }
      >
        {tr.settings.devices}
      </SectionTitle>

      <Card className="divide-y divide-stone-200 overflow-hidden lg:max-h-80 lg:overflow-y-auto lg:overscroll-contain dark:divide-stone-800">
        {sessions.isPending && <p className="p-4 text-sm text-stone-500">{tr.common.loading}</p>}
        {sessions.isError && <p className="p-4 text-sm text-red-600">{tr.settings.couldNotLoadDevices}</p>}
        {sessions.data?.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-4">
            <PlatformIcon platform={s.platform} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {s.deviceName ?? s.platform}
                {s.current && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {tr.settings.thisDevice}
                  </span>
                )}
              </p>
              <p className="text-sm text-stone-500 dark:text-stone-400">{tr.settings.lastActive(timeAgo(s.lastUsedAt))}</p>
            </div>
            {!s.current && (
              <button
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending && revoke.variables === s.id}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                {tr.settings.logOut}
              </button>
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}
