import type { EphemeralInput } from "@six/shared";
import { Flame } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { EPHEMERAL_OPTIONS, shortRule } from "@/lib/ephemeral";
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
  const [open, setOpen] = useState(false);
  const label = value ? shortRule({ maxViews: value.maxViews ?? null, ttlSeconds: value.ttlSeconds ?? null }) : null;
  const color = value ? flame : compact ? t.faint : t.textSoft;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={label ? `Self-destruct: ${label}` : "Self-destruct"}
        style={
          compact
            ? styles.compact
            : [styles.pill, { backgroundColor: value ? "rgba(249,115,22,0.15)" : t.field }]
        }
      >
        <Flame size={compact ? 20 : 18} color={color} fill={value ? flame : "none"} />
        {!compact && <Text style={{ color, fontSize: 14, fontWeight: "600" }}>{label ?? "Self-destruct"}</Text>}
      </Pressable>
      {open && (
        <Sheet
          title="Self-destruct after viewing"
          onClose={() => setOpen(false)}
          actions={[
            ...EPHEMERAL_OPTIONS.map((o) => ({ label: o.label, onSelect: () => onChange(o.value) })),
            ...(value ? [{ label: "Off", destructive: true, onSelect: () => onChange(null) }] : []),
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
