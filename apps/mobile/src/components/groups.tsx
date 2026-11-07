import { SixApiError } from "@six/sdk";
import { type ChatDTO, type ChatMemberDTO, type Dict, GROUP_MAX_PLACES, GROUP_MIN_PLACES, chatFace, randomAlias, randomGender } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Copy, LogOut, MoreHorizontal, Pencil, RefreshCw, Share2, Shuffle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { groupUrl, shareGroup } from "@/lib/format";
import {
  createGroup,
  leaveGroup,
  removeGroupMember,
  resetGroupLink,
  setGroupRole,
  updateGroup,
  updateGroupMe,
} from "@/lib/groups";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { PhotoPicker } from "./photo-picker";
import { Sheet } from "./sheet";
import { Text, TextInput } from "./text";
import { Popup, PrimaryButton, Toggle } from "./ui";

/** The words for a failed group request, from its error code. */
export function groupError(err: unknown, tr: Dict) {
  const code = err instanceof SixApiError ? err.code : null;
  if (code === "GROUP_FULL") return tr.groups.full;
  if (code === "GROUP_BANNED") return tr.groups.banned;
  if (code === "GROUP_LINK_INVALID") return tr.groups.invalidLink;
  if (code === "NOT_IN_GROUPS") return tr.groups.notInGroups;
  return err instanceof SixApiError ? err.message : tr.common.couldNotSave;
}

function Field({ label, hint, style, ...props }: React.ComponentProps<typeof TextInput> & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textSoft, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      <TextInput placeholderTextColor={t.muted} {...props} style={[styles.input, { backgroundColor: t.field, color: t.text }, style]} />
      {hint && <Text style={{ color: t.muted, fontSize: 12 }}>{hint}</Text>}
    </View>
  );
}

function Places({ value, min, onChange }: { value: number | null; min: number; onChange: (n: number | null) => void }) {
  const t = useTheme();
  const tr = useT();
  const [text, setText] = useState(String(value ?? ""));
  return (
    <View style={{ gap: 6 }}>
      <Field
        label={tr.groups.places}
        hint={value === null ? undefined : tr.groups.placesHint(value)}
        keyboardType="number-pad"
        maxLength={2}
        value={text}
        onChangeText={(raw) => {
          const v = raw.replace(/\D/g, "");
          const n = Number(v);
          setText(v);
          onChange(v && n >= min && n <= GROUP_MAX_PLACES ? n : null);
        }}
      />
      {value === null && <Text style={{ color: t.danger, fontSize: 12 }}>{tr.groups.placesRange(min, GROUP_MAX_PLACES)}</Text>}
    </View>
  );
}

/** The name and photo you show in a group, for creating, joining or changing them. */
export function NicknameFields({
  nickname,
  photo,
  onNickname,
  onPhoto,
}: {
  nickname: string;
  photo: string | null;
  onNickname: (v: string) => void;
  onPhoto: (v: string) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const [gender, setGender] = useState(randomGender);
  return (
    <View style={{ gap: 12 }}>
      <PhotoPicker name={nickname} photo={photo} onChange={onPhoto} kind={gender} ring={nickname} />
      <View style={[styles.row, { justifyContent: "center" }]}>
        {(["female", "male"] as const).map((g) => (
          <Pressable
            key={g}
            onPress={() => setGender(g)}
            accessibilityState={{ selected: gender === g }}
            style={[styles.pill, { backgroundColor: gender === g ? brand : t.field }]}
          >
            <Text style={{ color: gender === g ? brandInk : t.textSoft, fontWeight: "600" }}>
              {g === "female" ? tr.groups.girl : tr.groups.boy}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.textSoft, fontWeight: "600", fontSize: 14 }}>{tr.groups.yourNickname}</Text>
        <View style={[styles.row, styles.nameBox, { backgroundColor: t.field }]}>
          <View style={[styles.swatch, { backgroundColor: nickname }]} />
          <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700", fontFamily: "monospace" }}>{nickname}</Text>
          <Pressable onPress={() => onNickname(randomAlias())} hitSlop={6} style={[styles.row, { gap: 6, padding: 8 }]}>
            <Shuffle size={16} color={brand} />
            <Text style={{ color: brand, fontWeight: "600" }}>{tr.groups.newName}</Text>
          </Pressable>
        </View>
        <Text style={{ color: t.muted, fontSize: 12 }}>{tr.groups.nicknameHint}</Text>
      </View>
    </View>
  );
}

function DescriptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tr = useT();
  return (
    <Field
      label={tr.groups.description}
      placeholder={tr.groups.descriptionPlaceholder}
      value={value}
      onChangeText={onChange}
      maxLength={500}
      multiline
      textAlignVertical="top"
      style={{ minHeight: 80 }}
    />
  );
}

function ErrorText({ children }: { children: string | null }) {
  const t = useTheme();
  return children ? <Text style={{ color: t.danger }}>{children}</Text> : null;
}

/** Starts a group with a name, a photo, a number of places and the face you show in it, then opens it. */
export function NewGroup({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [places, setPlaces] = useState<number | null>(GROUP_MAX_PLACES);
  const [nickname, setNickname] = useState(randomAlias);
  const [face, setFace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (places === null) return;
    setSaving(true);
    setError(null);
    try {
      const chat = await createGroup(qc, {
        title: title.trim(),
        ...(description.trim() && { description: description.trim() }),
        maxMembers: places,
        nickname: nickname.trim(),
        ...(photo && { photo }),
        ...(face && { nicknamePhoto: face }),
      });
      onClose();
      router.push({ pathname: "/chats/[id]", params: { id: chat.id, info: "1" } });
    } catch (err) {
      setError(groupError(err, tr));
      setSaving(false);
    }
  }

  return (
    <Popup onClose={onClose} gap={18}>
      <Text style={[styles.heading, { color: t.text }]}>{tr.groups.newGroup}</Text>
      <PhotoPicker name={title} photo={photo} onChange={setPhoto} kind="food" />
      <Field label={tr.groups.name} placeholder={tr.groups.namePlaceholder} value={title} onChangeText={setTitle} maxLength={64} />
      <DescriptionField value={description} onChange={setDescription} />
      <Places value={places} min={GROUP_MIN_PLACES} onChange={setPlaces} />
      <View style={[styles.rule, { backgroundColor: t.border }]} />
      <NicknameFields nickname={nickname} photo={face} onNickname={setNickname} onPhoto={setFace} />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton title={tr.groups.create} busy={saving} disabled={saving || !title.trim() || !nickname.trim() || places === null} onPress={() => void save()} />
    </Popup>
  );
}

function EditGroup({ chat, onClose }: { chat: ChatDTO; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState(chat.title);
  const [description, setDescription] = useState(chat.group!.description ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [places, setPlaces] = useState<number | null>(chat.group!.maxMembers);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const descriptionChanged = description.trim() !== (chat.group!.description ?? "");
  const changed = title.trim() !== chat.title || descriptionChanged || !!photo || places !== chat.group!.maxMembers;

  async function save() {
    if (places === null) return;
    setSaving(true);
    setError(null);
    try {
      await updateGroup(qc, chat.id, {
        ...(title.trim() !== chat.title && { title: title.trim() }),
        ...(descriptionChanged && { description: description.trim() }),
        ...(photo && { photo }),
        ...(places !== chat.group!.maxMembers && { maxMembers: places }),
      });
      onClose();
    } catch (err) {
      setError(groupError(err, tr));
      setSaving(false);
    }
  }

  return (
    <Popup onClose={onClose} gap={18}>
      <Text style={[styles.heading, { color: t.text }]}>{tr.groups.edit}</Text>
      <PhotoPicker name={title} photo={photo ?? chat.group!.photoUrl} onChange={setPhoto} kind="food" />
      <Field label={tr.groups.name} value={title} onChangeText={setTitle} maxLength={64} />
      <DescriptionField value={description} onChange={setDescription} />
      <Places value={places} min={Math.max(GROUP_MIN_PLACES, chat.members.length)} onChange={setPlaces} />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton title={tr.common.save} busy={saving} disabled={saving || !title.trim() || !changed || places === null} onPress={() => void save()} />
    </Popup>
  );
}

function EditMe({ chat, me, onClose }: { chat: ChatDTO; me: ChatMemberDTO; onClose: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [nickname, setNickname] = useState(me.user.displayName);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateGroupMe(qc, chat.id, {
        ...(nickname.trim() !== me.user.displayName && { nickname: nickname.trim() }),
        ...(photo && { photo }),
      });
      onClose();
    } catch (err) {
      setError(groupError(err, tr));
      setSaving(false);
    }
  }

  return (
    <Popup onClose={onClose} gap={18}>
      <NicknameFields nickname={nickname} photo={photo ?? me.user.avatarUrl} onNickname={setNickname} onPhoto={setPhoto} />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton
        title={tr.common.save}
        busy={saving}
        disabled={saving || !nickname.trim() || (nickname.trim() === me.user.displayName && !photo)}
        onPress={() => void save()}
      />
    </Popup>
  );
}

type View_ = "info" | "edit" | "me" | "reset" | "leave" | { member: ChatMemberDTO } | { removing: ChatMemberDTO };

/** Everything about a group: its link, its members and what you may do with them, and the way out. */
export function GroupInfo({ chat, onClose }: { chat: ChatDTO; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const meId = useSession((s) => s.user!.id);
  const [view, setView] = useState<View_>("info");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = chat.group!;
  const me = chat.members.find((m) => m.user.id === meId)!;
  const admin = group.myRole !== "member";
  const canManage = (m: ChatMemberDTO) =>
    m.user.id !== meId && (group.myRole === "owner" || (group.myRole === "admin" && m.role === "member"));
  const run = (work: Promise<unknown>) => void work.catch((err) => setError(groupError(err, tr)));
  const back = () => setView("info");

  if (view === "edit") return <EditGroup chat={chat} onClose={back} />;
  if (view === "me") return <EditMe chat={chat} me={me} onClose={back} />;
  if (view === "reset") {
    return (
      <Sheet
        title={tr.groups.resetConfirm}
        onClose={back}
        actions={[{ label: tr.groups.resetLink, destructive: true, onSelect: () => run(resetGroupLink(qc, chat.id)) }]}
      />
    );
  }
  if (view === "leave") {
    return (
      <Sheet
        title={group.myRole === "owner" && chat.members.length > 1 ? `${tr.groups.leaveConfirm} ${tr.groups.leaveOwner}` : tr.groups.leaveConfirm}
        onClose={back}
        actions={[
          {
            label: tr.groups.leave,
            destructive: true,
            onSelect: () =>
              run(
                leaveGroup(qc, chat.id).then(() => {
                  onClose();
                  router.replace("/");
                }),
              ),
          },
        ]}
      />
    );
  }
  if (typeof view === "object" && "removing" in view) {
    return (
      <Sheet
        title={tr.groups.removeConfirm(view.removing.user.displayName)}
        onClose={back}
        actions={[{ label: tr.groups.remove, destructive: true, onSelect: () => run(removeGroupMember(chat.id, view.removing.user.id)) }]}
      />
    );
  }
  if (typeof view === "object") {
    const m = view.member;
    return (
      <Sheet
        title={m.user.displayName}
        onClose={back}
        actions={[
          ...(group.myRole === "owner"
            ? [
                m.role === "admin"
                  ? { label: tr.groups.dismissAdmin, onSelect: () => run(setGroupRole(qc, chat.id, m.user.id, { role: "member" })) }
                  : { label: tr.groups.makeAdmin, onSelect: () => run(setGroupRole(qc, chat.id, m.user.id, { role: "admin" })) },
              ]
            : []),
          { label: tr.groups.remove, destructive: true, keepOpen: true, onSelect: () => setView({ removing: m }) },
        ]}
      />
    );
  }

  const code = group.inviteCode;
  const link = code ? groupUrl(code) : "";
  const pill = (Icon: typeof Copy, label: string, onPress: () => void, iconOnly = false) => (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: t.surface }, iconOnly ? { flex: 0, paddingHorizontal: 12 } : null]}
    >
      <Icon size={16} color={t.text} />
      {!iconOnly && <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>}
    </Pressable>
  );

  return (
    <Popup onClose={onClose} gap={18}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Avatar user={chatFace(chat, meId)} size="xl" />
        <View style={styles.row}>
          <Text style={[styles.heading, { color: t.text }]}>{chat.title}</Text>
          {admin && (
            <Pressable onPress={() => setView("edit")} accessibilityLabel={tr.groups.edit} hitSlop={8}>
              <Pencil size={16} color={t.muted} />
            </Pressable>
          )}
        </View>
        <Text style={{ color: t.muted, fontSize: 14 }}>{tr.groups.membersOf(chat.members.length, group.maxMembers)}</Text>
        {group.description && <Text style={{ color: t.text, fontSize: 14, textAlign: "center" }}>{group.description}</Text>}
      </View>

      {code && (
        <View style={[styles.card, { backgroundColor: t.surfaceAlt }]}>
          <Text style={{ color: t.text, fontWeight: "700" }}>{tr.groups.inviteLink}</Text>
          <Text numberOfLines={1} style={{ color: t.textSoft, fontFamily: "monospace", fontSize: 13 }}>
            {link}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{tr.groups.inviteHint}</Text>
          <View style={styles.row}>
            {pill(Copy, copied ? tr.common.copied : tr.common.copyLink, () =>
              void Clipboard.setStringAsync(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }),
            )}
            {pill(Share2, tr.common.share, () => code && void shareGroup(chat.title, code))}
            {admin && pill(RefreshCw, tr.groups.resetLink, () => setView("reset"), true)}
          </View>
        </View>
      )}

      {admin && (
        <View style={{ borderRadius: 16, overflow: "hidden", backgroundColor: t.surfaceAlt }}>
          <Toggle
            label={tr.groups.membersCanWrite}
            hint={tr.groups.membersCanWriteHint}
            value={group.membersCanWrite}
            onChange={(on) => run(updateGroup(qc, chat.id, { membersCanWrite: on }))}
          />
          <Toggle
            label={tr.groups.membersCanInvite}
            hint={tr.groups.membersCanInviteHint}
            value={group.membersCanInvite}
            onChange={(on) => run(updateGroup(qc, chat.id, { membersCanInvite: on }))}
          />
        </View>
      )}

      <View>
        <Text style={{ color: t.text, fontWeight: "700", marginBottom: 4 }}>{tr.groups.members(chat.members.length)}</Text>
        {chat.members.map((m) => (
          <View key={m.user.id} style={[styles.row, { paddingVertical: 6, gap: 12 }]}>
            <Avatar user={m.user} />
            <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15 }}>
              {m.user.id === meId ? `${m.user.displayName} (${tr.common.you})` : m.user.displayName}
            </Text>
            {m.role !== "member" && (
              <Text style={[styles.badge, { color: brand }]}>{m.role === "owner" ? tr.groups.owner : tr.groups.admin}</Text>
            )}
            {m.user.id === meId ? (
              <Pressable onPress={() => setView("me")} accessibilityLabel={tr.common.edit} hitSlop={8}>
                <Pencil size={16} color={t.muted} />
              </Pressable>
            ) : canManage(m) ? (
              <Pressable onPress={() => setView({ member: m })} accessibilityLabel={m.user.displayName} hitSlop={8}>
                <MoreHorizontal size={18} color={t.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      <ErrorText>{error}</ErrorText>
      <Pressable onPress={() => setView("leave")} style={[styles.row, { justifyContent: "center", paddingVertical: 10 }]}>
        <LogOut size={16} color={t.danger} />
        <Text style={{ color: t.danger, fontWeight: "700" }}>{tr.groups.leave}</Text>
      </Pressable>
    </Popup>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameBox: { borderRadius: 12, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, gap: 12 },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  rule: { height: StyleSheet.hairlineWidth },
  card: { borderRadius: 16, padding: 12, gap: 6 },
  pill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 9 },
  badge: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
});
