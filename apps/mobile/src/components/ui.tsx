import { SixApiError } from "@six/sdk";
import type { Dict } from "@six/shared";
import type { LucideIcon } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, type Theme, useTheme } from "@/lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, { color: t.muted }]}>{children}</Text>
      {action}
    </View>
  );
}

export function PrimaryButton({
  title,
  style,
  busy,
  ...props
}: PressableProps & { title: string; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: t.inverse, opacity: props.disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={t.onInverse} />
      ) : (
        <Text style={[styles.primaryText, { color: t.onInverse }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({
  title,
  onPress,
  color,
  disabled,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.textButton, { opacity: disabled ? 0.5 : 1 }, pressed && { backgroundColor: t.pressed }]}
    >
      <Text style={{ color: color ?? t.textSoft, fontSize: 14, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  Icon,
  onPress,
  label,
  color,
  size = 22,
  disabled,
  style,
}: {
  Icon: LucideIcon;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: t.pressed },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Icon size={size} color={color ?? t.textSoft} />
    </Pressable>
  );
}

export function ScreenHeader({
  children,
  border = true,
  inset = true,
  background,
}: {
  children: React.ReactNode;
  border?: boolean;
  inset?: boolean;
  background?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: inset ? Math.max(insets.top, 8) + 4 : 12, backgroundColor: background ?? t.bg, borderColor: t.border },
        border && { borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      {children}
    </View>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const t = useTheme();
  const [bg, fg] = tone === "error" ? [t.dangerBg, t.dangerText] : [t.successBg, t.success];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text style={{ color: fg, fontSize: 14, textAlign: "center" }}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  Icon,
  title,
  children,
}: {
  Icon: LucideIcon;
  title?: string;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.chip }]}>
        <Icon size={32} strokeWidth={1.6} color={t.faint} />
      </View>
      {title && <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>}
      {typeof children === "string" ? (
        <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={styles.center}>
      <Text style={{ color: t.muted, fontSize: 14 }}>{label ?? tr.common.loading}</Text>
    </View>
  );
}

export const text = (t: Theme) =>
  StyleSheet.create({
    title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3, color: t.text },
    body: { fontSize: 15, color: t.text },
    muted: { fontSize: 13, color: t.muted },
    strong: { fontSize: 16, fontWeight: "600", color: t.text },
    brand: { color: brand },
  });

export function codeError(err: unknown, tr: Dict, errors: Record<string, string | undefined>) {
  const code = err instanceof SixApiError ? err.code : undefined;
  return (code && errors[code]) ?? tr.common.somethingWrongRetry;
}

export function CodeInput({
  value,
  onChange,
  label,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textSoft, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 8))}
        secureTextEntry
        keyboardType="number-pad"
        autoComplete="off"
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        maxLength={8}
        style={[styles.codeInput, { backgroundColor: t.field, color: t.text }]}
      />
    </View>
  );
}

export function Toggle({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={[styles.toggle, disabled && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{label}</Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: brand, false: t.ring }}
        thumbColor="#fff"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  codeInput: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, letterSpacing: 6 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  sectionText: { fontSize: 13, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  primary: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 14, fontWeight: "700" },
  textButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  notice: { borderRadius: 12, padding: 12 },
  empty: { alignItems: "center", gap: 10, padding: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
