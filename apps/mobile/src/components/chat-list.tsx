import { type ChatDTO, maskSpoilers, serviceText } from "@six/shared";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Archive, Ban, BellOff, ChevronLeft, EyeOff, Flame, MessageCircle, Palette, Pin, Timer } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useChats } from "@/lib/chats";
import { formatDuration, listTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { brand, brandInk, flame, stone, useTheme } from "@/lib/theme";
import { usePresence, useWatchPresence } from "@/lib/presence";
import { useIsTyping } from "@/lib/typing";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";
import { MediaIcon, mediaLabel } from "./media-label";
import { EmptyState, IconButton, PrimaryButton, ScreenHeader } from "./ui";

const statusText = { connecting: "Connecting…", syncing: "Updating…", offline: "Waiting for network…", live: null };

function Preview({ chat, meId, color }: { chat: ChatDTO; meId: string; color: string }) {
  const m = chat.lastMessage;
  const line = (icon: React.ReactNode, text: string, italic = false) => (
    <View style={styles.previewRow}>
      {icon}
      <Text numberOfLines={1} style={[styles.preview, { color }, italic && { fontStyle: "italic" }]}>
        {text}
      </Text>
    </View>
  );
  const you = m?.senderId === meId ? "You: " : "";

  if (!m) return line(null, "No messages");
  if (m.deletedAt) return line(<Ban size={14} color={color} />, "Message deleted", true);
  if (m.type === "service") {
    const icon = m.action?.type === "theme" ? <Palette size={14} color={color} /> : <Timer size={14} color={color} />;
    return line(icon, serviceText(m));
  }
  if (m.ephemeral) {
    const kind =
      m.type === "text"
        ? "message"
        : m.type === "video_note"
          ? "video message"
          : m.type === "voice"
            ? "voice message"
            : m.type === "image"
              ? "photo"
              : m.type;
    return line(
      <>
        {you ? <Text style={[styles.preview, { color }]}>{you}</Text> : null}
        <Flame size={14} color={flame} />
      </>,
      m.ephemeral.expired ? "Opened" : `Self-destructing ${kind}`,
    );
  }
  if (m.type !== "text") {
    const voiceLength =
      m.type === "voice" && m.attachment?.durationMs ? ` (${formatDuration(m.attachment.durationMs)})` : "";
    const extra =
      m.type === "file" && m.attachment && !m.text
        ? ` · ${m.attachment.name}`
        : m.text
          ? ` · ${maskSpoilers(m.text, m.entities)}`
          : "";
    return line(
      <>
        {you ? <Text style={[styles.preview, { color }]}>{you}</Text> : null}
        <MediaIcon type={m.type} color={color} />
      </>,
      `${mediaLabel(m.type)}${voiceLength}${extra}`,
    );
  }
  if (m.spoiler) {
    return line(
      <>
        {you ? <Text style={[styles.preview, { color }]}>{you}</Text> : null}
        <EyeOff size={14} color={color} />
      </>,
      "Spoiler",
      true,
    );
  }
  return line(null, you + maskSpoilers(m.text ?? "", m.entities).replace(/\s+/g, " "));
}

function ChatRow({ chat, meId }: { chat: ChatDTO; meId: string }) {
  const t = useTheme();
  const [menu, setMenu] = useState(false);
  const typing = useIsTyping(chat.id);
  const peer = chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
  const online = usePresence(peer.id === meId ? undefined : peer.id)?.online;
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
            {chat.muted && <BellOff size={14} color={t.faint} accessibilityLabel="Muted" />}
            <Text style={[styles.time, unread ? { color: brand, fontWeight: "600" } : { color: t.muted }]}>
              {listTime(chat.lastActivityAt)}
            </Text>
          </View>
          <View style={styles.rowLine}>
            <View style={{ flex: 1 }}>
              {typing ? (
                <Text style={[styles.preview, { color: brand, fontWeight: "500" }]}>typing…</Text>
              ) : (
                <Preview chat={chat} meId={meId} color={unread ? t.text : t.muted} />
              )}
            </View>
            {chat.pinned && !unread && (
              <Pin size={14} color={t.faint} style={{ transform: [{ rotate: "45deg" }] }} accessibilityLabel="Pinned" />
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
          onClose={() => setMenu(false)}
        />
      )}
    </>
  );
}

export function ChatList({ archived = false }: { archived?: boolean }) {
  const t = useTheme();
  const meId = useSession((s) => s.user!.id);
  const chats = useChats(archived);
  const archivedChats = useChats(true);
  const { status } = useRealtime();

  const visible = chats.data?.filter((c) => c.lastMessage !== null) ?? [];
  useWatchPresence(visible.flatMap((c) => c.members.map((m) => m.user.id)).filter((id) => id !== meId));
  const archivedCount = archivedChats.data?.filter((c) => c.lastMessage !== null).length ?? 0;

  const header =
    !archived && archivedCount > 0 ? (
      <Pressable
        onPress={() => router.push("/archived")}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
      >
        <View style={[styles.archiveIcon, { backgroundColor: t.chip }]}>
          <Archive size={20} color={t.muted} />
        </View>
        <Text style={[styles.archiveText, { color: t.textSoft }]}>Archived</Text>
        <Text style={{ color: t.muted }}>{archivedCount}</Text>
      </Pressable>
    ) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader inset={false}>
        {archived && <IconButton Icon={ChevronLeft} label="Back to chats" onPress={() => router.back()} size={26} />}
        <View style={{ flex: 1, paddingHorizontal: archived ? 0 : 4 }}>
          <Text style={[styles.title, { color: t.text }]}>{archived ? "Archived" : "Chats"}</Text>
          {statusText[status] && <Text style={{ color: t.muted, fontSize: 12 }}>{statusText[status]}</Text>}
        </View>
      </ScreenHeader>

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ChatRow chat={item} meId={meId} />}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={chats.isRefetching}
            onRefresh={() => void chats.refetch()}
            colors={[brand]}
            progressBackgroundColor={t.surface}
          />
        }
        ListEmptyComponent={
          chats.isPending ? (
            <Text style={[styles.note, { color: t.muted }]}>Loading…</Text>
          ) : chats.isError ? (
            <Text style={[styles.note, { color: t.danger }]}>Couldn't load chats.</Text>
          ) : archived || archivedCount === 0 ? (
            <EmptyState
              Icon={archived ? Archive : MessageCircle}
              title={archived ? "No archived chats" : "No conversations yet"}
            >
              {!archived && (
                <View style={{ alignItems: "center", gap: 12 }}>
                  <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
                    Pick someone from your contacts to start chatting.
                  </Text>
                  <PrimaryButton title="Open contacts" onPress={() => router.navigate("/contacts")} />
                </View>
              )}
            </EmptyState>
          ) : undefined
        }
      />
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
});
