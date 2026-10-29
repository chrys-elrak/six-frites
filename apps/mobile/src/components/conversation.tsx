import { type MessageDTO, chatTheme, durationLabel } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ChevronLeft, ChevronsUpDown, MoreVertical, Phone, ShieldAlert, Trash2, Video, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { deleteMessages } from "@/lib/actions";
import { isFrozen, useChat, useMessages } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { useSelection } from "@/lib/selection";
import { useSession } from "@/lib/session";
import { brand, useTheme } from "@/lib/theme";
import { presenceLabel, usePresence, useWatchPresence } from "@/lib/presence";
import { BubbleColorsContext } from "@/lib/bubble-colors";
import { startCall, useCall } from "@/lib/calls";
import { useKeyChanges } from "@/lib/e2ee";
import { useTyping } from "@/lib/typing";
import { Avatar } from "./avatar";
import { ChatBackground } from "./chat-background";
import { ChatBlocked } from "./chat-blocked";
import { ChatMenu } from "./chat-menu";
import { Composer } from "./composer";
import { ContactEditor } from "./contact-editor";
import { MessageList, type MessageListHandle } from "./message-list";
import { SharedMedia, type SharedTab } from "./shared-media";
import { Sheet } from "./sheet";
import { IconButton, Loading, ScreenHeader, TextButton } from "./ui";

export function Conversation({ chatId }: { chatId: string }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(qc, chatId);
  const messages = useMessages(chatId);
  const { realtime } = useRealtime();
  const list = useRef<MessageListHandle>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shared, setShared] = useState<SharedTab | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typing = useTyping(chatId);
  const inCall = useCall((s) => s.call !== null);
  const keyChanges = useKeyChanges((s) => s.userIds);
  const dismissKeyChange = useKeyChanges((s) => s.dismiss);
  const peerId = chat.data?.members.find((m) => m.user.id !== meId)?.user.id;
  const frozen = !!chat.data && isFrozen(chat.data);
  useWatchPresence(peerId && !frozen ? [peerId] : []);
  const presence = usePresence(frozen ? undefined : peerId);
  const theme = chatTheme(chat.data?.theme);
  const colors = t.dark ? theme.dark : theme.light;
  const bubble = useMemo(
    () => ({ bg: colors.bubble, ink: colors.bubbleInk, theirBg: colors.theirBubble, theirInk: colors.theirBubbleInk }),
    [colors],
  );
  const selecting = useSelection((s) => s.chatId === chatId);
  const selectedIds = useSelection((s) => s.ids);
  const clearSelection = useSelection((s) => s.clear);

  useEffect(() => {
    setActiveChat(chatId);
    return () => {
      setActiveChat(null);
      useSelection.getState().clear();
    };
  }, [chatId]);

  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clearSelection();
      return true;
    });
    return () => sub.remove();
  }, [selecting, clearSelection]);

  const unread = chat.data?.unreadCount ?? 0;
  const onSeen = useCallback(() => {
    if (unread > 0 && realtime && AppState.currentState === "active") {
      void realtime.markRead(chatId).catch(() => null);
    }
  }, [unread, realtime, chatId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && onSeen());
    return () => sub.remove();
  }, [onSeen]);

  const members = chat.data?.members;
  const nameOf = useMemo(() => {
    const names = new Map(members?.map((m) => [m.user.id, m.user.displayName]));
    return (id: string) => (id === meId ? tr.common.you : (names.get(id) ?? tr.common.someone));
  }, [members, meId, tr]);

  if (chat.isPending) return <Loading />;
  if (!chat.data) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.text, fontWeight: "600" }}>{tr.chat.notFound}</Text>
        <TextButton title={tr.common.backToChats} onPress={() => router.replace("/")} />
      </View>
    );
  }

  const c = chat.data;
  const peer = c.members.find((m) => m.user.id !== meId)?.user ?? c.members[0]!.user;
  const count = selecting ? selectedIds.length : 0;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const selectable = () =>
    (messages.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.type !== "service").map((m) => m.id);

  function chooseMessages() {
    const newest = selectable()[0];
    if (newest) useSelection.getState().start(chatId, newest);
  }

  function selectBetween() {
    const ids = selectable();
    const at = selectedIds.map((id) => ids.indexOf(id)).filter((i) => i >= 0);
    if (at.length) useSelection.setState({ ids: ids.slice(Math.min(...at), Math.max(...at) + 1) });
  }

  function removeSelected(scope: "me" | "all") {
    const byId = new Map<string, MessageDTO>((messages.data?.pages.flatMap((p) => p.items) ?? []).map((m) => [m.id, m]));
    const chosen = selectedIds.map((id) => byId.get(id)).filter((m): m is MessageDTO => !!m);
    clearSelection();
    void deleteMessages(qc, chatId, chosen, scope).catch(() => null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ChatBackground themeId={c.theme} />
      {selecting ? (
        <ScreenHeader background={t.bar}>
          <IconButton Icon={X} label={tr.chat.cancelSelection} onPress={clearSelection} />
          <Text style={[styles.title, { color: t.text }]}>{tr.chat.selected(count)}</Text>
          {count >= 2 && <IconButton Icon={ChevronsUpDown} label={tr.chat.selectBetween} onPress={selectBetween} />}
          <IconButton
            Icon={Trash2}
            label={tr.chat.deleteSelected}
            color={t.danger}
            disabled={count === 0}
            onPress={() => setConfirmDelete(true)}
          />
        </ScreenHeader>
      ) : (
        <ScreenHeader background={t.bar}>
          <IconButton Icon={ChevronLeft} label={tr.common.backToChats} size={26} onPress={goBack} />
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityLabel={tr.chat.editContact(c.title)}
            style={({ pressed }) => [styles.peer, pressed && { backgroundColor: t.pressed }]}
          >
            <Avatar user={peer} online={!!presence?.online} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
                {c.title}
              </Text>
              {typing ? (
                <Text style={{ color: brand, fontSize: 12, fontWeight: "600" }}>{tr.chats.typing[typing]}</Text>
              ) : (
                (presence || c.muted || c.archived || !!c.autoDeleteSecs) && (
                  <Text numberOfLines={2} style={{ color: presence?.online ? brand : t.muted, fontSize: 12 }}>
                    {[
                      presenceLabel(presence),
                      c.autoDeleteSecs && tr.chat.autoDelete(durationLabel(c.autoDeleteSecs, tr)),
                      c.muted && tr.common.muted,
                      c.archived && tr.common.archived,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )
              )}
            </View>
          </Pressable>
          {c.encrypted && !frozen && (
            <>
              <IconButton Icon={Phone} label={tr.chat.voiceCall} disabled={inCall} onPress={() => void startCall(c, false)} />
              <IconButton Icon={Video} label={tr.chat.videoCall} disabled={inCall} onPress={() => void startCall(c, true)} />
            </>
          )}
          <IconButton Icon={MoreVertical} label={tr.chat.options} onPress={() => setMenu(true)} />
        </ScreenHeader>
      )}

      {keyChanges.includes(peer.id) && !selecting && (
        <Pressable
          onPress={() => {
            dismissKeyChange(peer.id);
            setEditing(true);
          }}
          style={[styles.keyChange, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}
        >
          <ShieldAlert size={18} color={brand} />
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 13 }}>
            {tr.chat.safetyNumberChanged(peer.displayName)}
          </Text>
          <X size={16} color={t.muted} onPress={() => dismissKeyChange(peer.id)} />
        </Pressable>
      )}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <BubbleColorsContext.Provider value={bubble}>
            <MessageList ref={list} chat={c} meId={meId} onSeen={onSeen} />
          </BubbleColorsContext.Provider>
        </View>
        {!selecting &&
          (frozen ? (
            <ChatBlocked chat={c} peerId={peer.id} peerName={peer.displayName} />
          ) : (
            <Composer
              chatId={chatId}
              nameOf={nameOf}
              scheduledCount={c.scheduledCount}
              onSent={() => list.current?.scrollToBottom()}
            />
          ))}
      </KeyboardAvoidingView>

      {menu && (
        <ChatMenu
          chat={c}
          peerName={peer.displayName}
          peerId={peer.id}
          onClose={() => setMenu(false)}
          onDeleted={(scope) => scope === "me" && router.replace("/")}
          onChooseMessages={chooseMessages}
          onSharedMedia={setShared}
        />
      )}
      {shared && (
        <SharedMedia
          chat={c}
          initial={shared}
          onJump={(id) => {
            setShared(null);
            list.current?.jumpTo(id);
          }}
          onClose={() => setShared(null)}
        />
      )}
      {editing && <ContactEditor userId={peer.id} onClose={() => setEditing(false)} />}
      {confirmDelete && (
        <Sheet
          title={tr.chat.deleteMessages(count)}
          onClose={() => setConfirmDelete(false)}
          actions={[
            ...(c.type === "direct"
              ? [{ label: tr.chat.deleteForMeAnd(peer.displayName), destructive: true, onSelect: () => removeSelected("all") }]
              : []),
            { label: tr.chat.deleteForMe, destructive: true, onSelect: () => removeSelected("me") },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "700" },
  keyChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  peer: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingVertical: 2, paddingRight: 8 },
});
