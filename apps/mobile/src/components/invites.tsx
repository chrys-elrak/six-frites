import { SixApiError, unwrap } from "@six/sdk";
import {
  CONTACT_LINK_DAYS,
  type InvitePreview,
  inviteLimitNote,
  invitePlacesLeft,
  MAX_CONTACT_LINK_USES,
  MAX_INVITE_DAYS,
  MAX_INVITE_MESSAGE,
} from "@six/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View, ScrollView } from "react-native";
import { Text, TextInput } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shareInvite } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { IconButton, Notice, PrimaryButton } from "./ui";

export const invitePreviewQuery = (code: string) => ({
  queryKey: ["invite", code],
  queryFn: async () => unwrap(await six.api.GET("/v1/invites/{code}", { params: { path: { code } } })),
  retry: false,
});

export const quotaQuery = {
  queryKey: ["invite-quota"],
  queryFn: async () => unwrap(await six.api.GET("/v1/me/invite-quota")),
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const DAYS = [1, 2, 3, 7, 14, 21, MAX_INVITE_DAYS];

function Stepper({
  label,
  options,
  value,
  format = String,
  onChange,
}: {
  label: string;
  options: number[];
  value: number;
  format?: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const t = useTheme();
  const i = options.indexOf(value);
  const step = (by: number) => options[i + by];
  return (
    <View style={styles.stepper}>
      <Text style={[styles.stepLabel, { color: t.text }]}>{label}</Text>
      <IconButton
        Icon={Minus}
        label={`${label}: ${format(step(-1) ?? value)}`}
        onPress={() => onChange(step(-1)!)}
        disabled={i === 0}
        size={18}
      />
      <Text style={[styles.stepValue, { color: t.text }]}>{format(value)}</Text>
      <IconButton
        Icon={Plus}
        label={`${label}: ${format(step(1) ?? value)}`}
        onPress={() => onChange(step(1)!)}
        disabled={i === options.length - 1}
        size={18}
      />
    </View>
  );
}

export function NewInvite({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(7);
  const quota = useQuery(quotaQuery);
  const left = quota.data ? invitePlacesLeft(quota.data) : 0;
  const note = quota.data && inviteLimitNote(quota.data, tr);
  const people = Math.min(maxUses, left);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await six.api.POST("/v1/invites", {
          body: { message: message.trim() || undefined, maxUses: people, expiresInDays: days },
        }),
      ),
    onSuccess: async (invite) => {
      void qc.invalidateQueries({ queryKey: ["invites"] });
      void qc.invalidateQueries({ queryKey: ["invite-quota"] });
      onClose();
      await shareInvite(invite.code);
    },
  });

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: t.text }]}>{tr.settings.newLink}</Text>
              <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
            </View>
            <View style={{ gap: 6 }}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                maxLength={MAX_INVITE_MESSAGE}
                multiline
                placeholder={tr.settings.inviteMessagePlaceholder}
                placeholderTextColor={t.muted}
                accessibilityLabel={tr.settings.inviteMessage}
                style={[styles.message, { backgroundColor: t.field, color: t.text }]}
              />
              <Text style={{ color: t.muted, fontSize: 12 }}>{tr.settings.inviteMessageHint}</Text>
            </View>
            {left > 0 && (
              <Stepper label={tr.settings.invitePeople} options={range(left)} value={people} onChange={setMaxUses} />
            )}
            <Stepper
              label={tr.settings.inviteValidFor}
              options={DAYS}
              value={days}
              format={(n) => tr.time.duration(n, "day")}
              onChange={setDays}
            />
            {note && <Text style={{ color: t.textSoft, fontSize: 14 }}>{note}</Text>}
            {create.isError && (
              <Notice tone="error">
                {create.error instanceof SixApiError ? create.error.message : tr.common.somethingWrong}
              </Notice>
            )}
            <PrimaryButton
              title={tr.settings.createLink}
              onPress={() => create.mutate()}
              busy={create.isPending}
              disabled={create.isPending || !left}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Picks how long my reusable contact code works, a week at most, and for how many new contacts. */
export function NewContactLink({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [days, setDays] = useState(CONTACT_LINK_DAYS);
  const [people, setPeople] = useState(0);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await six.api.POST("/v1/me/contact-links", {
          body: { expiresAt: new Date(Date.now() + days * 864e5).toISOString(), maxUses: people || null },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contact-links"] });
      onClose();
    },
  });

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: t.text }]}>{tr.settings.newReusableCode}</Text>
              <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
            </View>
            <Stepper
              label={tr.settings.linkPeople}
              options={[...range(MAX_CONTACT_LINK_USES), 0]}
              value={people}
              format={(n) => (n ? String(n) : tr.settings.noLimit)}
              onChange={setPeople}
            />
            <Stepper
              label={tr.settings.inviteValidFor}
              options={range(CONTACT_LINK_DAYS)}
              value={days}
              format={(n) => tr.time.duration(n, "day")}
              onChange={setDays}
            />
            {create.isError && (
              <Notice tone="error">
                {create.error instanceof SixApiError ? create.error.message : tr.common.somethingWrong}
              </Notice>
            )}
            <PrimaryButton
              title={tr.settings.create}
              onPress={() => create.mutate()}
              busy={create.isPending}
              disabled={create.isPending}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function InviteCard({ invite }: { invite: InvitePreview }) {
  const t = useTheme();
  const tr = useT();
  const problem = {
    valid: null,
    expired: tr.auth.inviteExpired,
    exhausted: tr.auth.inviteUsedUp,
    revoked: tr.auth.inviteRevoked,
  }[invite.status];

  return (
    <View style={styles.card}>
      <Avatar user={invite.inviter} size="lg" />
      <Text style={[styles.invited, { color: t.text }]}>{tr.auth.invitedYou(invite.inviter.displayName)}</Text>
      {invite.message && (
        <Text style={[styles.bubble, { backgroundColor: t.chip, color: t.text }]}>{invite.message}</Text>
      )}
      {problem && <Text style={{ color: t.danger, textAlign: "center" }}>{problem}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "92%" },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  message: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 72, textAlignVertical: "top" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  stepValue: { minWidth: 72, textAlign: "center", fontSize: 15, fontVariant: ["tabular-nums"] },
  card: { alignItems: "center", gap: 12, width: "100%" },
  invited: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  bubble: {
    alignSelf: "stretch",
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
    overflow: "hidden",
  },
});
