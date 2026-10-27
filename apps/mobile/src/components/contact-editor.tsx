import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Shuffle, Trash2, X } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { updateContact } from "@/lib/actions";
import { suggestAvatars } from "@/lib/avatar-suggestions";
import { useT } from "@/lib/i18n";
import { pickAvatar } from "@/lib/media";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { SafetyNumber } from "./encryption-settings";
import { IconButton, Notice, PrimaryButton, Toggle } from "./ui";

const MAX_BYTES = 64 * 1024;

export function ContactEditor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const contact = useQuery({
    queryKey: ["contact", userId],
    queryFn: async () => unwrap(await six.api.GET("/v1/contacts/{userId}", { params: { path: { userId } } })),
  });
  const share = useMutation({
    mutationFn: async (shared: boolean) =>
      unwrap(await six.api.PUT("/v1/contacts/{userId}/profile", { params: { path: { userId } }, body: { shared } })),
    onSuccess: (dto) => qc.setQueryData(["contact", userId], dto),
  });
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState(() => suggestAvatars());
  const [picked, setPicked] = useState<number | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);
  const shot = useRef<ComponentRef<typeof View>>(null);

  const c = contact.data;
  if (c && name === null) setName(c.customName ?? "");
  const shownPhoto = photo === undefined ? (c?.user.avatarUrl ?? null) : photo;
  const hasCustomPhoto = photo === undefined ? !!c?.hasCustomPhoto : photo !== null;

  async function choosePhoto() {
    setError(null);
    try {
      const url = await pickAvatar();
      if (url) {
        setPhoto(url);
        setPicked(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  async function chooseSuggestion(i: number) {
    setError(null);
    setRendering(suggestions[i]!);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      for (const quality of [0.85, 0.7, 0.55]) {
        const base64 = await captureRef(shot, { format: "jpg", quality, result: "base64", width: 192, height: 192 });
        if (Math.floor((base64.length * 3) / 4) <= MAX_BYTES) {
          setPhoto(`data:image/jpeg;base64,${base64}`);
          setPicked(i);
          return;
        }
      }
      throw new Error("too big");
    } catch {
      setError(tr.contacts.couldNotUsePicture);
    }
  }

  async function save() {
    if (!c) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = (name ?? "").trim();
      const showingRealName = !(trimmed && trimmed !== c.originalName);
      await updateContact(qc, userId, {
        displayName: showingRealName ? null : trimmed,
        ...(photo !== undefined && { photo }),
      });
      onClose();
    } catch (err) {
      setError(err instanceof SixApiError ? err.message : tr.common.couldNotSave);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.heading, { color: t.text }]}>{tr.contacts.editContact}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>

          {!c ? (
            <Text style={{ color: t.muted, textAlign: "center", paddingVertical: 32 }}>
              {contact.isError ? tr.contacts.notFound : tr.common.loading}
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18 }}>
              <View style={{ alignItems: "center", gap: 10 }}>
                <Pressable onPress={choosePhoto} accessibilityLabel={tr.contacts.choosePhoto}>
                  <Avatar user={{ displayName: name || c.user.displayName, avatarUrl: shownPhoto }} size="lg" />
                  <View style={styles.cameraBadge}>
                    <Camera size={22} color="#fff" />
                  </View>
                </Pressable>
                {hasCustomPhoto && (
                  <Pressable
                    onPress={() => {
                      setPhoto(null);
                      setPicked(null);
                    }}
                    style={styles.removePhoto}
                  >
                    <Trash2 size={16} color={t.danger} />
                    <Text style={{ color: t.danger, fontWeight: "600" }}>{tr.contacts.removePhoto}</Text>
                  </Pressable>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <View style={styles.suggestHead}>
                  <Text style={{ color: t.textSoft, fontWeight: "600", fontSize: 14 }}>{tr.contacts.orPickPicture}</Text>
                  <Pressable onPress={() => setSuggestions(suggestAvatars())} style={styles.shuffle} hitSlop={6}>
                    <Shuffle size={16} color={brand} />
                    <Text style={{ color: brand, fontWeight: "600" }}>{tr.contacts.shuffle}</Text>
                  </Pressable>
                </View>
                <View style={styles.grid}>
                  {suggestions.map((svg, i) => (
                    <Pressable
                      key={i}
                      onPress={() => void chooseSuggestion(i)}
                      accessibilityLabel={tr.contacts.usePicture}
                      style={[styles.suggestion, picked === i && { borderColor: brand }]}
                    >
                      <View style={styles.suggestionClip}>
                        <SvgXml xml={svg} width="100%" height="100%" />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ color: t.textSoft, fontWeight: "600", fontSize: 14 }}>{tr.contacts.name}</Text>
                <TextInput
                  value={name ?? ""}
                  onChangeText={setName}
                  placeholder={tr.contacts.name}
                  placeholderTextColor={t.muted}
                  maxLength={64}
                  style={[styles.input, { backgroundColor: t.field, color: t.text }]}
                />
                <View style={styles.suggestHead}>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{tr.contacts.onlyYouSee}</Text>
                  {!!name && (
                    <Pressable onPress={() => setName("")} hitSlop={6}>
                      <Text style={{ color: brand, fontSize: 12, fontWeight: "600" }}>{tr.contacts.useTheirName}</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {c.customName && (
                <View style={[styles.reveal, { backgroundColor: t.field }]}>
                  <Text style={{ color: t.text, fontSize: 14 }}>
                    <Text style={{ color: t.muted }}>{tr.contacts.realName}</Text>
                    <Text style={{ fontWeight: "600" }}>{c.originalName}</Text>
                  </Text>
                </View>
              )}

              <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: t.field }}>
                <Toggle
                  label={tr.contacts.shareProfile}
                  hint={tr.contacts.shareProfileHint}
                  value={share.isPending ? !!share.variables : c.sharingProfile}
                  disabled={share.isPending}
                  onChange={(on) => share.mutate(on)}
                />
              </View>

              {error && <Notice tone="error">{error}</Notice>}
              <PrimaryButton title={saving ? tr.common.saving : tr.common.save} disabled={saving} onPress={() => void save()} />
              <SafetyNumber userId={userId} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>

      {rendering && (
        <View ref={shot} collapsable={false} style={styles.offscreen}>
          <SvgXml xml={rendering} width={192} height={192} />
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "92%" },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  heading: { flex: 1, fontSize: 18, fontWeight: "700" },
  cameraBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  removePhoto: { flexDirection: "row", alignItems: "center", gap: 6 },
  suggestHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shuffle: { flexDirection: "row", alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestion: { width: "14.5%", aspectRatio: 1, borderRadius: 999, borderWidth: 2, borderColor: "transparent", padding: 1 },
  suggestionClip: { flex: 1, borderRadius: 999, overflow: "hidden" },
  reveal: { borderRadius: 12, padding: 12, gap: 8 },
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  offscreen: { position: "absolute", left: -1000, top: 0, width: 192, height: 192, backgroundColor: "#fff" },
});
