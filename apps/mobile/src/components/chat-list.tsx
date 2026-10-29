import { type ChatDTO, maskSpoilers, serviceText, shownType } from "@six/shared";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import {
  Archive,
  Ban,
  BellOff,
  ChevronLeft,
  EyeOff,
  Flame,
  Lock,
  MessageCircle,
  Palette,
  Phone,
  PhoneMissed,
  Pin,
  Search,
  Share2,
  Timer,
  UserPlus,
  Video,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./text";
import { isFrozen, useChats } from "@/lib/chats";
import { useHydratedMessage } from "@/lib/e2ee";
import { formatDuration, listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { brand, brandInk, flame, stone, useTheme } from "@/lib/theme";
import { usePresence, useWatchPresence } from "@/lib/presence";
import { useTyping } from "@/lib/typing";
import { useDrafts } from "@/lib/drafts";
import { AddContact } from "./add-contact";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";
import { NewInvite } from "./invites";
import { MediaIcon, type MediaType, mediaLabel } from "./media-label";
import { EmptyState, IconButton, PrimaryButton, ScreenHeader } from "./ui";
import { UpdateBanner } from "./update-banner";

function Preview({ chat, meId, color }: { chat: ChatDTO; meId: string; color: string }) {
  const tr = useT();
  const m = useHydratedMessage(meId, chat.lastMessage) as
    | (NonNullable<ChatDTO["lastMessage"]> & { undecryptable?: boolean; decrypting?: boolean })
    | null;
  const line = (icon: React.ReactNode, text: string, italic = false) => (
    <View style={styles.previewRow}>
      {icon}
      <Text numberOfLines={1} style={[styles.preview, { color }, italic && { fontStyle: "italic" }]}>
        {text}
      </Text>
    </View>
  );
  const you = m?.senderId === meId ? tr.chats.youPrefix : "";

  if (!m) return line(null, tr.chats.noMessages);
  if (m.deletedAt) return line(<Ban size={14} color={color} />, tr.summary.messageDeleted, true);
  if (m.type === "service") {
    const icon =
      m.action?.type === "theme" ? (
        <Palette size={14} color={color} />
      ) : m.action?.type === "e2ee" ? (
        <Lock size={14} color={color} />
      ) : m.action?.type === "call" ? (
        m.action.secs === null ? (
          <PhoneMissed size={14} color={color} />
        ) : m.action.video ? (
          <Video size={14} color={color} />
        ) : (
          <Phone size={14} color={color} />
        )
      ) : (
        <Timer size={14} color={color} />
      );
    return line(icon, serviceText(m, tr));
  }
  if (m.undecryptable || m.decrypting) {
    return line(<Lock size={14} color={color} />, m.decrypting ? tr.chats.decrypting : tr.chats.encryptedMessage, true);
  }
  if (m.ephemeral) {
    return line(
      <>
        {you ? <Text style={[styles.preview, { color }]}>{you}</Text> : null}
        <Flame size={14} color={flame} />
      </>,
      m.ephemeral.expired ? tr.chats.opened : tr.chats.selfDestructing[m.type],
    );
  }
  if (m.type !== "text") {
    const type = shownType(m as typeof m & { file?: { sticker?: boolean } }) as MediaType;
    const voiceLength =
      m.type === "voice" && m.attachment?.durationMs ? ` (${formatDuration(m.attachment.durationMs)})` : "";
    const extra =
      m.type === "file" && m.attachment && !m.text
        ? ` · ${m.attachment.name}`
        : m.type === "checklist" && m.checklist
          ? ` · ${m.checklist.title}`
          : m.type === "game" && m.game
            ? ` · ${tr.calls[m.game.game]}`
            : m.text
              ? ` · ${maskSpoilers(m.text, m.entities)}`
              : "";
    return line(
      <>
        {you ? <Text style={[styles.preview, { color }]}>{you}</Text> : null}
        <MediaIcon type={type} color={color} />
      </>,
      `${mediaLabel(type, tr)}${voiceLength}${extra}`,
    );
  }
  if (m.spoiler) {
    return line(
      <>
        {you ? <Text style={[styles.preview, { color }]}>{you}</Text> : null}
        <EyeOff size={14} color={color} />
      </>,
      tr.summary.spoiler,
      true,
    );
  }
  return line(null, you + maskSpoilers(m.text ?? "", m.entities).replace(/\s+/g, " "));
}

function ChatRow({ chat, meId }: { chat: ChatDTO; meId: string }) {
  const t = useTheme();
  const tr = useT();
  const [menu, setMenu] = useState(false);
  const typing = useTyping(chat.id);
  const draft = useDrafts((s) => s.byChat[chat.id]);
  const peer = chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
  const online = usePresence(peer.id === meId || isFrozen(chat) ? undefined : peer.id)?.online;
  const unread = chat.unreadCount > 0;

  return (
    <>
      <Pressable
        onPress={() => router.push(`/chats/${chat.id}`)}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMenu(true);
        }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
      >
        <Avatar user={peer} size="md" online={!!online} />
        <View style={styles.rowBody}>
          <View style={styles.rowLine}>
            <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
              {chat.title}
            </Text>
            {chat.muted && <BellOff size={14} color={t.faint} accessibilityLabel={tr.common.muted} />}
            <Text style={[styles.time, unread ? { color: brand, fontWeight: "600" } : { color: t.muted }]}>
              {listTime(chat.lastActivityAt)}
            </Text>
          </View>
          <View style={styles.rowLine}>
            <View style={{ flex: 1 }}>
              {typing ? (
                <Text style={[styles.preview, { color: brand, fontWeight: "500" }]}>{tr.chats.typing[typing]}</Text>
              ) : draft ? (
                <Text numberOfLines={1} style={[styles.preview, { color: t.muted }]}>
                  <Text style={{ color: t.danger }}>{tr.chats.draft}</Text> {draft.replace(/\s+/g, " ")}
                </Text>
              ) : (
                <Preview chat={chat} meId={meId} color={unread ? t.text : t.muted} />
              )}
            </View>
            {chat.pinned && !unread && (
              <Pin size={14} color={t.faint} style={{ transform: [{ rotate: "45deg" }] }} accessibilityLabel={tr.chats.pinned} />
            )}
            {unread && (
              <View style={[styles.badge, { backgroundColor: chat.muted ? (t.dark ? stone[700] : stone[300]) : brand }]}>
                <Text style={[styles.badgeText, { color: chat.muted ? t.textSoft : brandInk }]}>
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
      {menu && (
        <ChatMenu
          chat={chat}
          peerName={peer.displayName}
          peerId={peer.id}
          onClose={() => setMenu(false)}
        />
      )}
    </>
  );
}

export function ChatList({ archived = false }: { archived?: boolean }) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const chats = useChats(archived);
  const archivedChats = useChats(true);
  const { status } = useRealtime();
  const statusText = {
    connecting: tr.common.connecting,
    syncing: tr.chats.updating,
    offline: tr.chats.waitingForNetwork,
    live: null,
  }[status];

  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"add" | "invite" | null>(null);
  const [pulled, setPulled] = useState(false);
  useFocusEffect(useCallback(() => () => setPulled(false), []));
  const needle = query.trim().toLowerCase();
  const visible = chats.data?.filter((c) => c.title.toLowerCase().includes(needle)) ?? [];
  useWatchPresence(visible.flatMap((c) => c.members.map((m) => m.user.id)).filter((id) => id !== meId));
  const archivedCount = archivedChats.data?.length ?? 0;
  const archivedUnread = archivedChats.data?.reduce((n, c) => n + c.unreadCount, 0) ?? 0;

  const header = archived ? undefined : (
    <>
      <UpdateBanner />
      {pulled && !needle && archivedCount > 0 && (
        <Pressable
          onPress={() => router.push("/archived")}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
        >
          <View style={[styles.archiveIcon, { backgroundColor: t.chip }]}>
            <Archive size={20} color={t.muted} />
          </View>
          <Text style={[styles.archiveText, { color: t.textSoft }]}>{tr.common.archived}</Text>
          {archivedUnread > 0 && (
            <View style={[styles.badge, { backgroundColor: brand }]}>
              <Text style={[styles.badgeText, { color: brandInk }]}>{archivedUnread > 99 ? "99+" : archivedUnread}</Text>
            </View>
          )}
        </Pressable>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.glass }}>
      <ScreenHeader inset={false}>
        {archived && (
          <IconButton Icon={ChevronLeft} label={tr.common.backToChats} onPress={() => router.back()} size={26} />
        )}
        <View style={{ flex: 1, gap: 10, paddingHorizontal: archived ? 0 : 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.text }]}>{archived ? tr.common.archived : tr.common.chats}</Text>
              {statusText && <Text style={{ color: t.muted, fontSize: 12 }}>{statusText}</Text>}
            </View>
            {!archived && (
              <>
                <IconButton Icon={Share2} color={brand} label={tr.contacts.inviteFriend} onPress={() => setDialog("invite")} />
                <IconButton Icon={UserPlus} color={brand} label={tr.contacts.addContact} onPress={() => setDialog("add")} />
              </>
            )}
          </View>
          <View style={[styles.search, { backgroundColor: t.chip }]}>
            <Search size={16} color={t.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tr.contacts.search}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.contacts.search}
              style={[styles.searchInput, { color: t.text }]}
            />
          </View>
        </View>
      </ScreenHeader>

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ChatRow chat={item} meId={meId} />}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={chats.isRefetching}
            onRefresh={() => {
              setPulled(true);
              void chats.refetch();
            }}
            colors={[brand]}
            progressBackgroundColor={t.surface}
          />
        }
        ListEmptyComponent={
          chats.isPending ? (
            <Text style={[styles.note, { color: t.muted }]}>{tr.common.loading}</Text>
          ) : chats.isError ? (
            <Text style={[styles.note, { color: t.danger }]}>{tr.chats.couldNotLoad}</Text>
          ) : needle ? (
            <Text style={[styles.note, { color: t.muted, textAlign: "center" }]}>{tr.contacts.noMatch(query.trim())}</Text>
          ) : (
            <EmptyState
              Icon={archived ? Archive : MessageCircle}
              title={archived ? tr.chats.noArchived : tr.chats.noChats}
            >
              {!archived && (
                <View style={{ alignItems: "center", gap: 12 }}>
                  <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
                    {tr.chats.noChatsHint}
                  </Text>
                  <PrimaryButton title={tr.contacts.addContact} onPress={() => setDialog("add")} />
                </View>
              )}
            </EmptyState>
          )
        }
      />
      {dialog === "add" && <AddContact onClose={() => setDialog(null)} />}
      {dialog === "invite" && <NewInvite onClose={() => setDialog(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flex: 1, fontSize: 16, fontWeight: "600" },
  time: { fontSize: 12 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  preview: { fontSize: 14, flexShrink: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  archiveIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  archiveText: { flex: 1, fontSize: 15, fontWeight: "500" },
  note: { padding: 16, fontSize: 14 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
});
