import { SixApiError, unwrap } from "@six/sdk";
import {
  inviteSummary,
  LOCALES,
  LOCALE_NAMES,
  quotaSummary,
  MAX_CONTACT_LINKS,
  type SessionDTO,
  TONES,
  type UpdateMeInput,
} from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ChevronRight, LogOut, Monitor, Smartphone, Volume2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { Text, TextInput } from "./text";
import { formatCode, contactUrl, sendAtLabel, shareContact, shareInvite, timeAgo } from "@/lib/format";
import { setPlainFont, usePlainFont } from "@/lib/font";
import { setLocale, useLocale, useT } from "@/lib/i18n";
import { playTone, useNotifyPrefs } from "@/lib/notify";
import { pickAvatar } from "@/lib/media";
import { registerPush } from "@/lib/push";
import { logout, useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { AccountCard, BlockedPeople } from "./account-settings";
import { EncryptionSettings } from "./encryption-settings";
import { AppLockSettings } from "./app-lock";
import { Avatar } from "./avatar";
import { QrCode } from "./qr-code";
import { ScheduleDialog } from "./scheduled";
import { NewInvite } from "./invites";
import { QuickReactionsSettings } from "./reactions";
import { Sheet } from "./sheet";
import { Card, Divider, Notice, PrimaryButton, ScreenHeader, SectionTitle, TextButton, Toggle } from "./ui";
import { UpdateCard } from "./update-banner";
import { WhatsNew } from "./whats-new";

function ProfileCard() {
  const t = useTheme();
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (body: UpdateMeInput) => unwrap(await six.api.PATCH("/v1/me", { body })),
    onSuccess: setUser,
    onError: (err) => setError(err instanceof SixApiError ? err.message : tr.common.couldNotSave),
  });

  async function choosePhoto() {
    setError(null);
    try {
      const photo = await pickAvatar();
      if (photo) save.mutate({ photo });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  const dirty = name.trim() !== user.displayName && name.trim().length > 0;

  return (
    <Card style={{ padding: 16, gap: 10 }}>
      <View style={styles.profile}>
        <Pressable onPress={choosePhoto} disabled={save.isPending} accessibilityLabel={tr.settings.changePhoto}>
          <Avatar user={user} size="md" />
          <View style={styles.cameraBadge}>
            <Camera size={18} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={64}
              accessibilityLabel={tr.settings.displayName}
              returnKeyType="done"
              onSubmitEditing={() => dirty && save.mutate({ displayName: name.trim() })}
              style={[styles.nameInput, { color: t.text }]}
            />
            {dirty && (
              <TextButton
                title={tr.common.save}
                onPress={() => save.mutate({ displayName: name.trim() })}
                disabled={save.isPending}
                color={t.text}
              />
            )}
          </View>
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>
            {user.email}
          </Text>
        </View>
      </View>
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>{tr.settings.seenAs}</Text>
      {user.avatarUrl && (
        <TextButton
          title={tr.settings.removePhoto}
          onPress={() => save.mutate({ photo: null })}
          disabled={save.isPending}
          color={t.danger}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

/** Opens Android's settings for the messages channel, whose sound plays when the app is closed. */
function openChannelSettings() {
  const pkg = Constants.expoConfig?.android?.package;
  if (!pkg) return void Linking.openSettings();
  void Linking.sendIntent("android.settings.CHANNEL_NOTIFICATION_SETTINGS", [
    { key: "android.provider.extra.APP_PACKAGE", value: pkg },
    { key: "android.provider.extra.CHANNEL_ID", value: "messages" },
  ]).catch(() => Linking.openSettings());
}

function NotificationSettings() {
  const t = useTheme();
  const tr = useT();
  const prefs = useNotifyPrefs();
  return (
    <View>
      <SectionTitle>{tr.settings.notifications}</SectionTitle>
      <Card>
        <Toggle
          label={tr.settings.sound}
          hint={tr.settings.soundHint}
          value={prefs.sound}
          onChange={(on) => {
            prefs.set({ sound: on });
            if (on) playTone();
          }}
        />
        {prefs.sound && (
          <View style={styles.tones} accessibilityRole="radiogroup">
            {TONES.map((tone) => {
              const on = prefs.tone === tone;
              return (
                <Pressable
                  key={tone}
                  onPress={() => {
                    prefs.set({ tone });
                    playTone(tone);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [
                    styles.tone,
                    { backgroundColor: on ? brand : t.field, transform: [{ scale: pressed ? 0.95 : 1 }] },
                  ]}
                >
                  <Volume2 size={14} color={on ? brandInk : t.textSoft} />
                  <Text style={{ color: on ? brandInk : t.text, fontSize: 14, fontWeight: "600" }}>
                    {tr.settings.tones[tone]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Divider />
        <Pressable onPress={openChannelSettings} accessibilityRole="button" style={styles.channelRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{tr.settings.closedSound}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{tr.settings.closedSoundHint}</Text>
          </View>
          <ChevronRight size={18} color={t.faint} />
        </Pressable>
        <Divider />
        <Toggle
          label={tr.settings.popups}
          hint={tr.settings.popupsHint}
          value={prefs.popups}
          onChange={(on) => prefs.set({ popups: on })}
        />
      </Card>
    </View>
  );
}

function LanguagePicker() {
  const t = useTheme();
  const tr = useT();
  const current = useLocale((s) => s.locale);
  return (
    <View>
      <SectionTitle>{tr.common.language}</SectionTitle>
      <Card>
        {LOCALES.map((l, i) => (
          <View key={l}>
            {i > 0 && <Divider />}
            <Pressable
              onPress={() => {
                setLocale(l);
                void registerPush().catch(() => null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: l === current }}
              style={styles.cardRow}
            >
              <Text style={{ flex: 1, color: t.text, fontWeight: "500", fontSize: 15 }}>{LOCALE_NAMES[l]}</Text>
              {l === current && <Check size={18} color={brand} />}
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  );
}

function FontPicker() {
  const tr = useT();
  const plain = usePlainFont((s) => s.on);
  return (
    <View>
      <SectionTitle>{tr.settings.font}</SectionTitle>
      <Card>
        <Toggle
          label={tr.settings.deviceFont}
          hint={tr.settings.deviceFontHint}
          value={!plain}
          onChange={(on) => setPlainFont(!on)}
        />
      </Card>
    </View>
  );
}

function CodeRow({ code, label, children }: { code: string; label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.cardRow}>
      <View style={[styles.qr, { width: 112, height: 112, backgroundColor: "#fff" }]}>
        <QrCode value={contactUrl(code)} size={112} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
        <Text style={[styles.code, { color: t.text }]}>{formatCode(code)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginLeft: -10 }}>{children}</View>
      </View>
    </View>
  );
}

function FindMe() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [confirmReset, setConfirmReset] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me")),
  });
  useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);

  const reset = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/me/contact-code")),
    onSuccess: setUser,
  });

  const links = useQuery({
    queryKey: ["contact-links"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/contact-links")).items,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contact-links"] });
  const create = useMutation({
    mutationFn: async (expiresAt: Date | null) =>
      unwrap(await six.api.POST("/v1/me/contact-links", { body: { expiresAt: expiresAt?.toISOString() ?? null } })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (code: string) =>
      unwrap(await six.api.DELETE("/v1/me/contact-links/{code}", { params: { path: { code } } })),
    onSuccess: refresh,
  });
  const items = links.data ?? [];

  return (
    <View>
      <SectionTitle>{tr.settings.findMe}</SectionTitle>
      <Card>
        {user.contactCode ? (
          <CodeRow code={user.contactCode} label={tr.settings.contactCode}>
            <TextButton title={tr.common.shareLink} color={t.text} onPress={() => void shareContact(user.contactCode)} />
            <TextButton title={tr.settings.newCode} onPress={() => setConfirmReset(true)} disabled={reset.isPending} />
          </CodeRow>
        ) : null}
        <Text style={{ color: t.muted, fontSize: 13, paddingHorizontal: 16, paddingBottom: 16 }}>{tr.settings.oneUseHint}</Text>
      </Card>

      <View style={{ height: 24 }} />
      <SectionTitle>{tr.settings.reusableCodes}</SectionTitle>
      <Card>
        <Text style={{ color: t.muted, fontSize: 13, padding: 16 }}>{tr.settings.reusableHint}</Text>
        {items.map((l) => (
          <View key={l.code}>
            <Divider />
            <CodeRow
              code={l.code}
              label={l.expiresAt ? tr.settings.worksUntil(sendAtLabel(l.expiresAt)) : tr.settings.worksUntilDeleted}
            >
              <TextButton title={tr.common.shareLink} color={t.text} onPress={() => void shareContact(l.code)} />
              <TextButton title={tr.common.delete} onPress={() => setDeleting(l.code)} />
            </CodeRow>
          </View>
        ))}
        {items.length < MAX_CONTACT_LINKS && (
          <>
            <Divider />
            <Pressable onPress={() => setChoosing(true)} disabled={create.isPending} style={styles.cardRow}>
              <Text style={{ color: brand, fontWeight: "600", fontSize: 15 }}>{tr.settings.newReusableCode}</Text>
            </Pressable>
          </>
        )}
      </Card>

      {confirmReset && (
        <Sheet
          title={tr.settings.resetCodeWarning}
          actions={[{ label: tr.settings.getNewCode, destructive: true, onSelect: () => reset.mutate() }]}
          onClose={() => setConfirmReset(false)}
        />
      )}
      {choosing && (
        <Sheet
          title={tr.settings.newReusableCode}
          actions={[
            { label: tr.settings.untilDeleted, onSelect: () => create.mutate(null) },
            { label: tr.settings.untilDate, onSelect: () => setPickingDate(true) },
          ]}
          onClose={() => setChoosing(false)}
        />
      )}
      {pickingDate && (
        <ScheduleDialog
          title={tr.settings.stopsWorking}
          confirm={tr.settings.create}
          initial={new Date(Date.now() + 7 * 864e5)}
          onPick={(at) => {
            setPickingDate(false);
            create.mutate(at);
          }}
          onClose={() => setPickingDate(false)}
        />
      )}
      {deleting && (
        <Sheet
          title={tr.settings.deleteCodeWarning}
          actions={[{ label: tr.common.delete, destructive: true, onSelect: () => remove.mutate(deleting) }]}
          onClose={() => setDeleting(null)}
        />
      )}
    </View>
  );
}

function Invites() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const invites = useInfiniteQuery({
    queryKey: ["invites"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/invites", { params: { query: { limit: 10, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const quota = useQuery({
    queryKey: ["invite-quota"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/invite-quota")),
  });

  const revoke = useMutation({
    mutationFn: async (code: string) =>
      unwrap(await six.api.POST("/v1/invites/{code}/revoke", { params: { path: { code } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });

  const items = invites.data?.pages.flatMap((p) => p.items) ?? [];
  const used = quota.data && quotaSummary(quota.data, tr);
  const full = quota.data?.limit != null && quota.data.invited >= quota.data.limit;

  return (
    <View>
      <SectionTitle>{tr.settings.inviteFriends}</SectionTitle>
      <Card>
        <View style={styles.cardRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: t.textSoft, fontSize: 14 }}>{tr.settings.inviteHint}</Text>
            {used && <Text style={{ color: t.muted, fontSize: 12 }}>{used}</Text>}
            {full && <Text style={{ color: t.text, fontSize: 12 }}>{tr.settings.inviteLimitReached}</Text>}
          </View>
          <PrimaryButton title={tr.settings.newLink} onPress={() => setCreating(true)} />
        </View>
        {items.map((i) => {
          const dead = i.status !== "valid" || (i.expiresAt !== null && Date.parse(i.expiresAt) < Date.now());
          return (
            <View key={i.code}>
              <Divider />
              <View style={[styles.cardRow, dead && { opacity: 0.5 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.code, { color: t.text }]}>{i.code}</Text>
                  {i.message && (
                    <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontStyle: "italic" }}>
                      “{i.message}”
                    </Text>
                  )}
                  <Text style={{ color: t.muted, fontSize: 13 }}>{inviteSummary(i, tr)}</Text>
                </View>
                {!dead && (
                  <View style={{ alignItems: "flex-end" }}>
                    <TextButton title={tr.common.share} onPress={() => void shareInvite(i.code)} />
                    <TextButton title={tr.settings.revoke} color={t.danger} onPress={() => setRevoking(i.code)} />
                  </View>
                )}
              </View>
            </View>
          );
        })}
        {invites.hasNextPage && (
          <>
            <Divider />
            <Pressable onPress={() => void invites.fetchNextPage()} style={{ padding: 12, alignItems: "center" }}>
              <Text style={{ color: t.muted, fontWeight: "600" }}>{tr.settings.showOlderLinks}</Text>
            </Pressable>
          </>
        )}
      </Card>
      {creating && <NewInvite onClose={() => setCreating(false)} />}
      {revoking && (
        <Sheet
          title={tr.settings.revokeWarning}
          actions={[{ label: tr.settings.revoke, destructive: true, onSelect: () => revoke.mutate(revoking) }]}
          onClose={() => setRevoking(null)}
        />
      )}
    </View>
  );
}

function Referrals() {
  const t = useTheme();
  const tr = useT();
  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/referrals", { params: { query: { limit: 50 } } })),
  });
  const items = referrals.data?.items ?? [];
  if (!items.length) return null;

  return (
    <View>
      <SectionTitle>{tr.settings.joinedWithLinks}</SectionTitle>
      <Card>
        {items.map((r, i) => (
          <View key={r.id}>
            {i > 0 && <Divider />}
            <View style={styles.cardRow}>
              <Avatar user={r.user} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: "500" }}>
                  {r.user.displayName}
                </Text>
                <Text style={{ color: t.muted, fontSize: 12, fontFamily: "monospace" }}>{tr.settings.viaLink(r.inviteCode)}</Text>
              </View>
              <Text style={{ color: t.muted, fontSize: 13 }}>{timeAgo(r.createdAt)}</Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

const platformIcon: Record<SessionDTO["platform"], typeof Monitor> = { web: Monitor, ios: Smartphone, android: Smartphone };

function Devices() {
  const t = useTheme();
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
    <View>
      <SectionTitle
        action={
          others > 0 && (
            <TextButton
              title={tr.settings.logOutOthers}
              color={t.danger}
              onPress={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending}
            />
          )
        }
      >
        {tr.settings.devices}
      </SectionTitle>
      <Card>
        {sessions.isPending && <Text style={[styles.cardRow, { color: t.muted }]}>{tr.common.loading}</Text>}
        {sessions.isError && <Text style={[styles.cardRow, { color: t.danger }]}>{tr.settings.couldNotLoadDevices}</Text>}
        {sessions.data?.map((s, i) => {
          const Icon = platformIcon[s.platform];
          return (
            <View key={s.id}>
              {i > 0 && <Divider />}
              <View style={styles.cardRow}>
                <View style={[styles.deviceIcon, { backgroundColor: t.surfaceAlt }]}>
                  <Icon size={20} color={t.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text numberOfLines={1} style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>
                      {s.deviceName ?? s.platform}
                    </Text>
                    {s.current && (
                      <View style={[styles.pill, { backgroundColor: t.successBg }]}>
                        <Text style={{ color: t.success, fontSize: 12, fontWeight: "600" }}>{tr.settings.thisDevice}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: t.muted, fontSize: 13 }}>{tr.settings.lastActive(timeAgo(s.lastUsedAt))}</Text>
                </View>
                {!s.current && (
                  <TextButton
                    title={tr.settings.logOut}
                    color={t.danger}
                    onPress={() => revoke.mutate(s.id)}
                    disabled={revoke.isPending && revoke.variables === s.id}
                  />
                )}
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

export function SettingsPanel() {
  const t = useTheme();
  const tr = useT();
  const link = (url: string) => () => void Linking.openURL(url);

  return (
    <View style={{ flex: 1, backgroundColor: t.glass }}>
      <ScreenHeader inset={false}>
        <Text style={[styles.title, { color: t.text }]}>{tr.common.settings}</Text>
        <Pressable onPress={() => void logout()} style={styles.signOut} hitSlop={6}>
          <LogOut size={16} color={t.textSoft} />
          <Text style={{ color: t.textSoft, fontWeight: "600" }}>{tr.settings.signOut}</Text>
        </Pressable>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <UpdateCard />
        <ProfileCard />
        <WhatsNew />
        <LanguagePicker />
        <FontPicker />
        <QuickReactionsSettings />
        <FindMe />
        <NotificationSettings />
        <Invites />
        <Referrals />
        <Devices />
        <EncryptionSettings />
        <AppLockSettings />
        <BlockedPeople />
        <AccountCard />
        <Text style={[styles.credits, { color: t.faint, paddingBottom: 0 }]}>
          {tr.common.version(`${Constants.expoConfig?.version} (${Constants.expoConfig?.android?.versionCode})`)}
        </Text>
        <Text style={[styles.credits, { color: t.faint }]}>
          {tr.settings.creditsFrom}{" "}
          <Text style={styles.link} onPress={link("https://googlefonts.github.io/noto-emoji-animation/")}>
            Noto Emoji Animation
          </Text>{" "}
          {tr.settings.creditsBy}{" "}
          <Text style={styles.link} onPress={link("https://creativecommons.org/licenses/by/4.0/")}>
            CC BY 4.0
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tones: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  tone: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  channelRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  title: { flex: 1, fontSize: 22, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  signOut: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  content: { padding: 16, gap: 24 },
  profile: { flexDirection: "row", alignItems: "center", gap: 16 },
  cameraBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  nameInput: { flex: 1, fontSize: 18, fontWeight: "500", paddingVertical: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  qr: { borderRadius: 8, overflow: "hidden" },
  code: { fontFamily: "monospace", fontSize: 16, fontWeight: "700", letterSpacing: 2 },
  deviceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  credits: { fontSize: 12, textAlign: "center", lineHeight: 18, paddingBottom: 8 },
  link: { textDecorationLine: "underline" },
});
