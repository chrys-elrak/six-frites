import type { EphemeralInput } from "@six/shared";
import { Flame } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "./text";
import { EPHEMERAL_OPTIONS, shortRule } from "@/lib/ephemeral";
import { useT } from "@/lib/i18n";
import { flame, useTheme } from "@/lib/theme";
import { Sheet } from "./sheet";

export function EphemeralPicker({
  value,
  onChange,
  compact = false,
}: {
  value: EphemeralInput | null;
  onChange: (value: EphemeralInput | null) => void;
  compact?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const label = value ? shortRule({ maxViews: value.maxViews ?? null, ttlSeconds: value.ttlSeconds ?? null }, tr) : null;
  const color = value ? flame : compact ? t.faint : t.textSoft;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={label ? tr.composer.selfDestructRule(label) : tr.composer.selfDestruct}
        style={
          compact
            ? styles.compact
            : [styles.pill, { backgroundColor: value ? "rgba(249,115,22,0.15)" : t.field }]
        }
      >
        <Flame size={compact ? 20 : 18} color={color} fill={value ? flame : "none"} />
        {!compact && <Text style={{ color, fontSize: 14, fontWeight: "600" }}>{label ?? tr.composer.selfDestruct}</Text>}
      </Pressable>
      {open && (
        <Sheet
          title={tr.composer.selfDestructAfterViewing}
          onClose={() => setOpen(false)}
          actions={[
            ...EPHEMERAL_OPTIONS.map((o) => ({ label: o.label, onSelect: () => onChange(o.value) })),
            ...(value ? [{ label: tr.common.off, destructive: true, onSelect: () => onChange(null) }] : []),
          ]}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  compact: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
