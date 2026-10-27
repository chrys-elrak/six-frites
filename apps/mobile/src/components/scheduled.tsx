import { unwrap } from "@six/sdk";
import { type Dict, SCHEDULE_LIMITS, type ScheduledMessageDTO, dayRange, maskSpoilers } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, EyeOff, Flame, Minus, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cancelScheduled, rescheduleMessage, scheduledKey, sendScheduledNow } from "@/lib/actions";
import { shortRule } from "@/lib/ephemeral";
import { clockTime, sendAtLabel } from "@/lib/format";
import { getLocale, useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { brand, flame, type Theme, useTheme } from "@/lib/theme";
import { MediaIcon, mediaLabel } from "./media-label";
import { IconButton, Notice, PrimaryButton, TextButton } from "./ui";

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface }]}>{children}</View>
      </View>
    </Modal>
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function at(day: Date, hour: number, minute: number) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function presets(now: Date, tr: Dict) {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 864e5);
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  return [
    { label: tr.chat.inOneHour, date: inHour },
    ...(now.getHours() < 19 ? [{ label: tr.chat.tonightAt("20:00"), date: at(today, 20, 0) }] : []),
    { label: tr.chat.tomorrowAt("09:00"), date: at(tomorrow, 9, 0) },
  ];
}

function Stepper({
  kind,
  label,
  value,
  onMinus,
  onPlus,
  t,
}: {
  kind: "day" | "hour" | "minute";
  label?: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  t: Theme;
}) {
  const step = useT().chat.steps[kind];
  return (
    <View style={[styles.stepper, { backgroundColor: t.field }]}>
      <IconButton Icon={kind === "day" ? ChevronLeft : Minus} label={step.earlier} onPress={onMinus} />
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={{ color: t.muted, fontSize: 11 }}>{label ?? step.label}</Text>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{value}</Text>
      </View>
      <IconButton Icon={kind === "day" ? ChevronRight : Plus} label={step.later} onPress={onPlus} />
    </View>
  );
}

/** Picks a send time with presets and day/hour/minute steppers, since React Native has no date-time input. */
export function ScheduleDialog({
  title,
  initial,
  onPick,
  onClose,
}: {
  title: string;
  initial?: Date;
  onPick: (at: Date) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const [value, setValue] = useState(() => {
    const d = initial ?? new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d;
  });
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  const shift = (ms: number) => {
    setError(null);
    setValue((v) => new Date(v.getTime() + ms));
  };

  function submit() {
    if (value.getTime() <= Date.now()) return setError(tr.chat.pickFuture);
    if (value.getTime() - Date.now() > SCHEDULE_LIMITS.maxAheadSeconds * 1000) return setError(tr.chat.pickWithinYear);
    onPick(value);
  }

  return (
    <Overlay onClose={onClose}>
      <View style={{ padding: 16, gap: 14 }}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <View style={styles.presets}>
          {presets(now, tr).map((p) => (
            <Pressable
              key={p.label}
              onPress={() => {
                setError(null);
                setValue(p.date);
              }}
              style={[styles.preset, { backgroundColor: t.field }]}
            >
              <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: brand, fontWeight: "700", fontSize: 16, textAlign: "center" }}>
          {sendAtLabel(value.toISOString())}
        </Text>
        <Stepper
          t={t}
          kind="day"
          value={value.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short" })}
          onMinus={() => shift(-864e5)}
          onPlus={() => shift(864e5)}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Stepper
              t={t}
              kind="hour"
              value={clockTime(value.toISOString()).split(":")[0] ?? ""}
              onMinus={() => shift(-36e5)}
              onPlus={() => shift(36e5)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Stepper
              t={t}
              kind="minute"
              value={String(value.getMinutes()).padStart(2, "0")}
              onMinus={() => shift(-5 * 6e4)}
              onPlus={() => shift(5 * 6e4)}
            />
          </View>
        </View>
        {error && <Notice tone="error">{error}</Notice>}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <TextButton title={tr.common.cancel} onPress={onClose} />
          </View>
          <PrimaryButton title={tr.chat.schedule} onPress={submit} style={{ flex: 1 }} />
        </View>
      </View>
    </Overlay>
  );
}

const dayLabel = (d: Date) => d.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short" });

/** Picks two days, up to today, for deleting the messages sent from the first through the last. */
export function DateRangeDialog({
  onPick,
  onClose,
}: {
  onPick: (range: { from: string; to: string }) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 864e5));
  const [to, setTo] = useState(() => new Date());
  const shift = (set: (d: Date) => void, d: Date, days: number) =>
    set(new Date(Math.min(d.getTime() + days * 864e5, Date.now())));

  return (
    <Overlay onClose={onClose}>
      <View style={{ padding: 16, gap: 14 }}>
        <Text style={[styles.title, { color: t.text }]}>{tr.chat.deleteWhich}</Text>
        <Stepper
          t={t}
          kind="day"
          label={tr.chat.rangeFrom}
          value={dayLabel(from)}
          onMinus={() => shift(setFrom, from, -1)}
          onPlus={() => shift(setFrom, from, 1)}
        />
        <Stepper
          t={t}
          kind="day"
          label={tr.chat.rangeTo}
          value={dayLabel(to)}
          onMinus={() => shift(setTo, to, -1)}
          onPlus={() => shift(setTo, to, 1)}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <TextButton title={tr.common.cancel} onPress={onClose} />
          </View>
          <PrimaryButton title={tr.common.next} onPress={() => onPick(dayRange(from, to))} style={{ flex: 1 }} />
        </View>
      </View>
    </Overlay>
  );
}

function Preview({ s }: { s: ScheduledMessageDTO }) {
  const t = useTheme();
  const tr = useT();
  const media = s.type !== "text" && s.type !== "service";
  const text =
    s.spoiler && s.type === "text"
      ? tr.summary.spoiler
      : s.text
        ? `${media ? "· " : ""}${maskSpoilers(s.text, s.entities)}`
        : "";
  return (
    <View style={styles.preview}>
      {s.ephemeral && <Flame size={14} color={flame} accessibilityLabel={shortRule(s.ephemeral)} />}
      {s.spoiler && s.type === "text" && <EyeOff size={14} color={t.muted} />}
      {media && <MediaIcon type={s.type as Exclude<typeof s.type, "text">} color={t.text} />}
      <Text numberOfLines={2} style={{ color: t.text, fontSize: 15, flexShrink: 1 }}>
        {media ? `${mediaLabel(s.type as Exclude<typeof s.type, "text">, tr)} ` : ""}
        {text}
      </Text>
    </View>
  );
}

export function ScheduledPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const [rescheduling, setRescheduling] = useState<ScheduledMessageDTO | null>(null);
  const list = useQuery({
    queryKey: scheduledKey(chatId),
    queryFn: async () =>
      unwrap(await six.api.GET("/v1/chats/{id}/scheduled-messages", { params: { path: { id: chatId } } })).items,
  });

  const run = (action: () => Promise<unknown>) =>
    void action().catch(() => qc.invalidateQueries({ queryKey: scheduledKey(chatId) }));

  if (rescheduling) {
    return (
      <ScheduleDialog
        title={tr.chat.reschedule}
        initial={new Date(rescheduling.sendAt)}
        onClose={() => setRescheduling(null)}
        onPick={(when) => {
          setRescheduling(null);
          run(() => rescheduleMessage(qc, rescheduling, when));
        }}
      />
    );
  }

  const items = list.data ?? [];
  return (
    <Overlay onClose={onClose}>
      <View style={[styles.head, { borderColor: t.border }]}>
        <Text style={[styles.title, { color: t.text, flex: 1, textAlign: "left" }]}>{tr.chat.scheduledMessages}</Text>
        <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
      </View>
      {list.isPending ? (
        <Text style={[styles.empty, { color: t.muted }]}>{tr.common.loading}</Text>
      ) : items.length === 0 ? (
        <Text style={[styles.empty, { color: t.muted }]}>{tr.chat.noScheduled}</Text>
      ) : (
        <ScrollView style={{ maxHeight: 480 }}>
          {items.map((s, i) => (
            <View key={s.id} style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border }]}>
              <Text style={{ color: brand, fontSize: 12, fontWeight: "600" }}>{sendAtLabel(s.sendAt)}</Text>
              <Preview s={s} />
              <View style={styles.actions}>
                <TextButton title={tr.chat.sendNow} color={t.text} onPress={() => run(() => sendScheduledNow(qc, s))} />
                <TextButton title={tr.chat.reschedule} color={t.text} onPress={() => setRescheduling(s)} />
                <TextButton title={tr.common.delete} color={t.danger} onPress={() => run(() => cancelScheduled(qc, s))} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  panel: { borderRadius: 20, overflow: "hidden" },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  preset: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 4, paddingVertical: 2 },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: 24, textAlign: "center", fontSize: 14 },
  item: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  preview: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", gap: 4, marginLeft: -10 },
});
