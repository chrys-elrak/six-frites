import { unwrap } from "@six/sdk";
import { latencyLabel, messageTrip } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { getLocale, useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { Sheet } from "./sheet";
import { Text } from "./text";

export function MessageTiming({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const timing = useQuery({
    queryKey: ["timing", messageId],
    queryFn: async () => unwrap(await six.api.GET("/v1/messages/{id}/timing", { params: { path: { id: messageId } } })),
    refetchInterval: (q) => (q.state.data && !q.state.data.arrivedAt ? 2000 : false),
  });
  const data = timing.data;
  const trip = data && messageTrip(data);
  const rows: [string, string][] =
    data && trip
      ? [
          [
            tr.messages.timingSent,
            new Date(data.sentAt ?? data.serverAt).toLocaleTimeString(getLocale(), {
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
      header={
        <View style={{ gap: 10, alignSelf: "stretch" }}>
          <Text style={{ color: t.text, fontWeight: "600", fontSize: 15, textAlign: "center" }}>{tr.messages.timing}</Text>
          {timing.isError || !data ? (
            <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
              {timing.isError ? tr.common.somethingWrongRetry : tr.common.loading}
            </Text>
          ) : (
            rows.map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
                <Text style={{ color: t.muted, fontSize: 14 }}>{label}</Text>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: "500", fontVariant: ["tabular-nums"] }}>{value}</Text>
              </View>
            ))
          )}
        </View>
      }
    />
  );
}
