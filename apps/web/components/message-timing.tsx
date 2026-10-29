"use client";

import { unwrap } from "@six/sdk";
import { latencyLabel, messageTrip } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { getLocale, useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { Sheet } from "./sheet";

export function MessageTiming({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const tr = useT();
  const timing = useQuery({
    queryKey: ["timing", messageId],
    queryFn: async () => unwrap(await six.api.GET("/v1/messages/{id}/timing", { params: { path: { id: messageId } } })),
    refetchInterval: (q) => (q.state.data && !q.state.data.arrivedAt ? 2000 : false),
  });
  const t = timing.data;
  const trip = t && messageTrip(t);
  const rows: [string, string][] =
    t && trip
      ? [
          [
            tr.messages.timingSent,
            new Date(t.sentAt ?? t.serverAt).toLocaleTimeString(getLocale(), {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          ],
          [tr.messages.timingUp, trip.up === null ? tr.messages.timingUnknown : latencyLabel(trip.up)],
          [tr.messages.timingDown, trip.down === null ? tr.messages.timingWaiting : latencyLabel(trip.down)],
          ...(trip.total === null ? [] : [[tr.messages.timingTotal, latencyLabel(trip.total)] as [string, string]]),
        ]
      : [];

  return (
    <Sheet
      actions={[]}
      onClose={onClose}
      title={
        <div className="space-y-3">
          <div className="font-semibold text-stone-900 dark:text-stone-100">{tr.messages.timing}</div>
          {timing.isError ? (
            <p>{tr.common.somethingWrongRetry}</p>
          ) : !t ? (
            <p>{tr.common.loading}</p>
          ) : (
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-left">
              {rows.map(([label, value]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd className="text-right font-medium text-stone-900 tabular-nums dark:text-stone-100">{value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </div>
      }
    />
  );
}
