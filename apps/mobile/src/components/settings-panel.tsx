import { SixApiError, unwrap } from "@six/sdk";
import { type InviteDTO, type SessionDTO, type UpdateMeInput, USERNAME_PATTERN } from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Monitor, Smartphone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { formatCode, contactUrl, shareContact, shareInvite, timeAgo } from "@/lib/format";
import {
  CHAT_THEMES,
  CUSTOM_THEME_COLORS,
  type ChatTheme,
  customTheme,
  customThemeColor,
  customThemeId,
} from "@six/shared";
import { useChatThemeStore } from "@/lib/chat-themes";
import { playChime, useNotifyPrefs } from "@/lib/notify";
import { logout, useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { AccountCard, BlockedPeople } from "./account-settings";
import { Avatar } from "./avatar";
import { Wallpaper } from "./chat-background";
import { CustomThemePicker } from "./custom-theme";
import { QrCode } from "./qr-code";
import { Sheet } from "./sheet";
import { Card, Divider, PrimaryButton, ScreenHeader, SectionTitle, TextButton } from "./ui";

function ProfileCard() {
  const t = useTheme();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.displayName);

  const save = useMutation({
    mutationFn: async () => unwrap(await six.api.PATCH("/v1/me", { body: { displayName: name.trim() } })),
    onSuccess: setUser,
  });

  const dirty = name.trim() !== user.displayName && name.trim().length > 0;

  return (
    <Card style={styles.profile}>
      <Avatar user={user} size="md" />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={64}
            accessibilityLabel="Display name"
            returnKeyType="done"
            onSubmitEditing={() => dirty && save.mutate()}
            style={[styles.nameInput, { color: t.text }]}
          />
          {dirty && (
            <TextButton title="Save" onPress={() => save.mutate()} disabled={save.isPending} color={t.text} />
          )}
        </View>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>
          {user.email}
        </Text>
      </View>
    </Card>
  );
}

function Toggle({
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
      style={[styles.cardRow, disabled && { opacity: 0.6 }]}
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

function ThemeSwatch({
  theme,
  on,
  label,
  onPress,
}: {
  theme: ChatTheme;
  on: boolean;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const w = t.dark ? theme.dark : theme.light;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={{ alignItems: "center", gap: 6 }}
    >
      <View style={[styles.swatch, { borderColor: on ? brand : t.border }]}>
        <Wallpaper theme={theme} dark={t.dark} id={`swatch-${theme.id}`} />
        <View style={[styles.swatchBubble, { backgroundColor: w.bubble }]} />
        <View style={[styles.swatchBubble, styles.swatchIn, { backgroundColor: t.bubbleIn }]} />
      </View>
      <Text style={{ color: on ? brand : t.textSoft, fontSize: 12, fontWeight: on ? "700" : "500" }}>{label}</Text>
    </Pressable>
  );
}

function ChatBackgroundPicker() {
  const current = useChatThemeStore((s) => s.id);
  const choose = useChatThemeStore((s) => s.set);
  const [custom, setCustom] = useState(false);
  const customHex = customThemeColor(current);
  return (
    <View>
      <SectionTitle>Default chat background</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
        {CHAT_THEMES.map((theme) => (
          <ThemeSwatch
            key={theme.id}
            theme={theme}
            on={theme.id === current}
            label={theme.name}
            onPress={() => choose(theme.id)}
          />
        ))}
        <ThemeSwatch
          theme={customTheme(customHex ?? CUSTOM_THEME_COLORS[3]!)}
          on={!!customHex}
          label="Custom…"
          onPress={() => setCustom(true)}
        />
      </ScrollView>
      {custom && (
        <CustomThemePicker
          title="Default custom background"
          current={current}
          onPick={(mine, theirs) => choose(customThemeId(mine, theirs))}
          onClose={() => setCustom(false)}
        />
      )}
    </View>
  );
}

function NotificationSettings() {
  const prefs = useNotifyPrefs();
  return (
    <View>
      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <Toggle
          label="Sound"
          hint="Plays a short chime for new messages."
          value={prefs.sound}
          onChange={(on) => {
            prefs.set({ sound: on });
            if (on) playChime();
          }}
        />
        <Divider />
        <Toggle
          label="Popups"
          hint="Shows new messages from other chats while you use the app."
          value={prefs.popups}
          onChange={(on) => prefs.set({ popups: on })}
        />
      </Card>
    </View>
  );
}

const usernameErrors: Record<string, string> = {
  USERNAME_TAKEN: "That username is taken.",
  VALIDATION_FAILED: "3 to 20 letters, digits or _, starting with a letter.",
};

function FindMe() {
  const t = useTheme();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const [username, setUsername] = useState(user.username ?? "");
  const [confirmReset, setConfirmReset] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me")),
  });
  useEffect(() => {
    if (!me.data) return;
    setUser(me.data);
    setUsername(me.data.username ?? "");
  }, [me.data, setUser]);

  const update = useMutation({
    mutationFn: async (body: UpdateMeInput) => unwrap(await six.api.PATCH("/v1/me", { body })),
    onSuccess: (u) => {
      setUser(u);
      setUsername(u.username ?? "");
    },
  });

  const reset = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/me/contact-code")),
    onSuccess: setUser,
  });

  const typed = username.trim().replace(/^@/, "").toLowerCase();
  const dirty = typed !== (user.username ?? "");
  const valid = typed === "" || USERNAME_PATTERN.test(typed);
  const save = () => dirty && valid && update.mutate({ username: typed || null });

  const hint = update.isError
    ? update.error instanceof SixApiError
      ? (usernameErrors[update.error.code] ?? update.error.message)
      : "Couldn't save. Try again."
    : !valid
      ? usernameErrors.VALIDATION_FAILED
      : "Optional. People can type it to find you.";

  return (
    <View>
      <SectionTitle>How people find you</SectionTitle>
      <Card>
        <View style={styles.cardRow}>
          <View style={[styles.qr, { width: 112, height: 112, backgroundColor: "#fff" }]}>
            {user.contactCode && <QrCode value={contactUrl(user.contactCode)} size={112} />}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: t.muted, fontSize: 13 }}>Your contact code</Text>
            <Text style={[styles.code, { color: t.text }]}>{user.contactCode ? formatCode(user.contactCode) : "…"}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginLeft: -10 }}>
              <TextButton
                title="Share link"
                color={t.text}
                disabled={!user.contactCode}
                onPress={() => void shareContact(user.contactCode)}
              />
              <TextButton title="New code" onPress={() => setConfirmReset(true)} disabled={reset.isPending} />
            </View>
          </View>
        </View>
        <Divider />
        <View style={[styles.cardRow, { alignItems: "flex-start", flexDirection: "column", gap: 6 }]}>
          <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>Username</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch" }}>
            <View style={[styles.usernameField, { backgroundColor: t.field }]}>
              <Text style={{ color: t.muted, fontSize: 16 }}>@</Text>
              <TextInput
                value={username}
                onChangeText={(v) => {
                  setUsername(v);
                  update.reset();
                }}
                onSubmitEditing={save}
                placeholder="pick one"
                placeholderTextColor={t.faint}
                maxLength={21}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                accessibilityLabel="Username"
                style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 8 }}
              />
            </View>
            {dirty && (
              <TextButton title="Save" color={t.text} onPress={save} disabled={!valid || update.isPending} />
            )}
          </View>
          <Text style={{ color: update.isError || !valid ? t.danger : t.muted, fontSize: 13 }}>{hint}</Text>
        </View>
        <Divider />
        <Toggle
          label="Find me by email"
          hint={`People who type ${user.email} exactly can find you`}
          value={user.findByEmail}
          disabled={update.isPending}
          onChange={(findByEmail) => update.mutate({ findByEmail })}
        />
      </Card>
      {confirmReset && (
        <Sheet
          title="Your current code, link and QR code will stop working. People you already chat with stay connected."
          actions={[{ label: "Get a new code", destructive: true, onSelect: () => reset.mutate() }]}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </View>
  );
}

function usesLabel(i: InviteDTO) {
  const uses = `${i.uses} joined`;
  return i.maxUses === null ? uses : `${uses} · ${i.maxUses - i.uses} left`;
}

function expiryLabel(i: InviteDTO) {
  if (!i.expiresAt) return "Never expires";
  const ms = Date.parse(i.expiresAt) - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.ceil(ms / 864e5);
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

function Invites() {
  const t = useTheme();
  const qc = useQueryClient();
  const invites = useInfiniteQuery({
    queryKey: ["invites"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/invites", { params: { query: { limit: 10, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const create = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites", { body: {} })),
    onSuccess: async (invite) => {
      await qc.invalidateQueries({ queryKey: ["invites"] });
      await shareInvite(invite.code);
    },
  });

  const items = invites.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View>
      <SectionTitle>Invite friends</SectionTitle>
      <Card>
        <View style={styles.cardRow}>
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 14 }}>Send a link to someone you want to chat with.</Text>
          <PrimaryButton title="New link" onPress={() => create.mutate()} disabled={create.isPending} />
        </View>
        {items.map((i) => {
          const dead =
            (i.expiresAt !== null && Date.parse(i.expiresAt) < Date.now()) || (i.maxUses !== null && i.uses >= i.maxUses);
          return (
            <View key={i.code}>
              <Divider />
              <View style={[styles.cardRow, dead && { opacity: 0.5 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.code, { color: t.text }]}>{i.code}</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>
                    {usesLabel(i)} · {expiryLabel(i)}
                  </Text>
                </View>
                {!dead && <TextButton title="Share" onPress={() => void shareInvite(i.code)} />}
              </View>
            </View>
          );
        })}
        {invites.hasNextPage && (
          <>
            <Divider />
            <Pressable onPress={() => void invites.fetchNextPage()} style={{ padding: 12, alignItems: "center" }}>
              <Text style={{ color: t.muted, fontWeight: "600" }}>Show older links</Text>
            </Pressable>
          </>
        )}
      </Card>
    </View>
  );
}

function Referrals() {
  const t = useTheme();
  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/referrals", { params: { query: { limit: 50 } } })),
  });
  const items = referrals.data?.items ?? [];
  if (!items.length) return null;

  return (
    <View>
      <SectionTitle>Joined with your links</SectionTitle>
      <Card>
        {items.map((r, i) => (
          <View key={r.id}>
            {i > 0 && <Divider />}
            <View style={styles.cardRow}>
              <Avatar user={r.user} />
              <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: "500" }}>
                {r.user.displayName}
              </Text>
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
              title="Log out other devices"
              color={t.danger}
              onPress={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending}
            />
          )
        }
      >
        Devices
      </SectionTitle>
      <Card>
        {sessions.isPending && <Text style={[styles.cardRow, { color: t.muted }]}>Loading…</Text>}
        {sessions.isError && <Text style={[styles.cardRow, { color: t.danger }]}>Couldn't load devices.</Text>}
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
                        <Text style={{ color: t.success, fontSize: 12, fontWeight: "600" }}>This device</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: t.muted, fontSize: 13 }}>Active {timeAgo(s.lastUsedAt)}</Text>
                </View>
                {!s.current && (
                  <TextButton
                    title="Log out"
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
  const link = (url: string) => () => void Linking.openURL(url);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader inset={false}>
        <Text style={[styles.title, { color: t.text }]}>Settings</Text>
        <Pressable onPress={() => void logout()} style={styles.signOut} hitSlop={6}>
          <LogOut size={16} color={t.textSoft} />
          <Text style={{ color: t.textSoft, fontWeight: "600" }}>Sign out</Text>
        </Pressable>
      </ScreenHeader>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileCard />
        <FindMe />
        <ChatBackgroundPicker />
        <NotificationSettings />
        <Invites />
        <Referrals />
        <Devices />
        <BlockedPeople />
        <AccountCard />
        <Text style={[styles.credits, { color: t.faint }]}>
          Animated emoji from{" "}
          <Text style={styles.link} onPress={link("https://googlefonts.github.io/noto-emoji-animation/")}>
            Noto Emoji Animation
          </Text>{" "}
          by Google, licensed{" "}
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
  title: { flex: 1, fontSize: 22, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  signOut: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  content: { padding: 16, gap: 24 },
  profile: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  nameInput: { flex: 1, fontSize: 18, fontWeight: "500", paddingVertical: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  swatch: { width: 78, height: 112, borderRadius: 14, borderWidth: 2, overflow: "hidden" },
  swatchBubble: { position: "absolute", right: 8, top: 22, width: 36, height: 14, borderRadius: 7 },
  swatchIn: { left: 8, right: undefined, top: 46, width: 44 },
  qr: { borderRadius: 8, overflow: "hidden" },
  usernameField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 10, paddingHorizontal: 10 },
  code: { fontFamily: "monospace", fontSize: 16, fontWeight: "700", letterSpacing: 2 },
  deviceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  credits: { fontSize: 12, textAlign: "center", lineHeight: 18, paddingBottom: 8 },
  link: { textDecorationLine: "underline" },
});
