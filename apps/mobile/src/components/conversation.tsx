import { type MessageDTO, chatFace, chatTheme, durationLabel, previewText, readOnlyGroup } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronsUpDown, Images, MoreVertical, Phone, PinOff, Search, ShieldAlert, Trash2, Video, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { closeChat, deleteMessages, updateChatSettings } from "@/lib/actions";
import { useArchiveShut } from "@/lib/archive-lock";
import { isBotChat, isFrozen, useChat, useMessages } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { clearChatNotifications } from "@/lib/push";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { MAX_SELECTED, useSelection } from "@/lib/selection";
import { useSession } from "@/lib/session";
import { brand, useTheme } from "@/lib/theme";
import { presenceLabel, usePresence, useWatchPresence } from "@/lib/presence";
import { BubbleColorsContext } from "@/lib/bubble-colors";
import { startCall, useCall } from "@/lib/calls";
import { e2eeFor, useHydratedMessage, useKeyChanges } from "@/lib/e2ee";
import { useTyping } from "@/lib/typing";
import { LockScreen } from "./app-lock";
import { Avatar } from "./avatar";
import { ChatBackground } from "./chat-background";
import { ChatBlocked } from "./chat-blocked";
import { ChatMenu } from "./chat-menu";
import { BotGames } from "./bot-games";
import { Composer } from "./composer";
import { ContactEditor } from "./contact-editor";
import { GroupInfo } from "./groups";
import { MessageList, type MessageListHandle } from "./message-list";
import { SharedMedia, type SharedTab } from "./shared-media";
import { Sheet } from "./sheet";
import { IconButton, Loading, ScreenHeader, TextButton } from "./ui";

function PinnedBar({
  message,
  label,
  meId,
  onJump,
  onUnpin,
}: {
  message: MessageDTO;
  label: string;
  meId: string;
  onJump: () => void;
  onUnpin?: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const m = useHydratedMessage(meId, message);
  return (
    <View style={[styles.pinned, { backgroundColor: t.bar, borderColor: t.border }]}>
      <Pressable onPress={onJump} accessibilityRole="button" style={styles.pinnedText}>
        <Text style={{ color: brand, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: t.textSoft, fontSize: 14 }}>
          {m && previewText(m, tr)}
        </Text>
      </Pressable>
      {onUnpin && <IconButton Icon={PinOff} label={tr.messages.unpin} size={18} onPress={onUnpin} />}
    </View>
  );
}

/**
 * A chat, or the app lock code first when it's archived and the archive is shut, however it was opened: from a
 * notification, a link or search. A chat archived from inside stays open until it's left.
 */
export function Conversation({ chatId }: { chatId: string }) {
  const tr = useT();
  const chat = useChat(useQueryClient(), chatId);
  const shut = useArchiveShut() && !!chat.data?.archived;
  const [unlocked, setUnlocked] = useState(false);
  const shown = useRef(false);
  if (!shut && chat.data) shown.current = true;
  if (shut && !unlocked && !shown.current) {
    return (
      <LockScreen
        title={tr.common.archived}
        onUnlock={() => setUnlocked(true)}
        onCancel={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
    );
  }
  return <OpenConversation chatId={chatId} />;
}

function OpenConversation({ chatId }: { chatId: string }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(qc, chatId);
  const messages = useMessages(chatId);
  const { realtime, status } = useRealtime();
  const list = useRef<MessageListHandle>(null);
  const [menu, setMenu] = useState(false);
  const { info } = useLocalSearchParams<{ info?: string }>();
  const [editing, setEditing] = useState(!!info);
  const [shared, setShared] = useState<SharedTab | null>(null);
  const [searchFor, setSearchFor] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pinIndex, setPinIndex] = useState(0);
  const typing = useTyping(chatId);
  const inCall = useCall((s) => s.call !== null);
  const keyChanges = useKeyChanges((s) => s.userIds);
  const dismissKeyChange = useKeyChanges((s) => s.dismiss);
  const peerId = chat.data?.group ? undefined : chat.data?.members.find((m) => m.user.id !== meId)?.user.id;
  const frozen = !!chat.data && isFrozen(chat.data);
  const hidePresence = frozen || !!chat.data?.withSupport || !!chat.data?.group;
  useWatchPresence(peerId && !hidePresence ? [peerId] : []);
  const presence = usePresence(hidePresence ? undefined : peerId);
  const theme = chatTheme(chat.data?.theme);
  const colors = t.dark ? theme.dark : theme.light;
  const bubble = useMemo(
    () => ({ bg: colors.bubble, ink: colors.bubbleInk, theirBg: colors.theirBubble, theirInk: colors.theirBubbleInk }),
    [colors],
  );
  const selecting = useSelection((s) => s.chatId === chatId);
  const selectedIds = useSelection((s) => s.ids);
  const clearSelection = useSelection((s) => s.clear);
  const encryptedFor = chat.data?.encrypted ? chat.data.members.map((m) => m.user.id).join(",") : null;

  useEffect(() => {
    if (encryptedFor) void e2eeFor(meId)?.warmDevices(encryptedFor.split(",")).catch(() => null);
  }, [encryptedFor, meId]);

  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setActiveChat(chatId);
      return () => {
        focused.current = false;
        setActiveChat(null);
      };
    }, [chatId]),
  );

  useEffect(() => {
    closeChat(chatId);
    clearChatNotifications(chatId);
    return () => {
      closeChat(chatId);
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
    if (unread > 0 && realtime && focused.current && AppState.currentState === "active") {
      void realtime.markRead(chatId).catch(() => null);
    }
  }, [unread, realtime, chatId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && onSeen());
    return () => sub.remove();
  }, [onSeen]);
  useFocusEffect(onSeen);

  const members = chat.data?.members;
  const nameOf = useMemo(() => {
    const names = new Map(members?.map((m) => [m.user.id, m.user.displayName]));
    const gone = chat.data?.group ? tr.groups.formerMember : tr.common.someone;
    return (id: string) => (id === meId ? tr.common.you : (names.get(id) ?? gone));
  }, [members, meId, tr, chat.data?.group]);

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
  const peer = chatFace(c, meId);
  const app = c.withSupport;
  const count = selecting ? selectedIds.length : 0;
  const pins = c.pinnedMessages;
  const pin = pins[pinIndex % (pins.length || 1)];
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
          <Text style={[styles.title, { color: t.text }]}>{tr.chat.selected(count)}
            {count >= MAX_SELECTED && " · max"}
          </Text>
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
            onPress={() => !app && setEditing(true)}
            disabled={app}
            accessibilityLabel={app || c.group ? c.title : tr.chat.editContact(c.title)}
            style={({ pressed }) => [styles.peer, pressed && { backgroundColor: t.pressed }]}
          >
            <Avatar user={peer} online={!!presence?.online} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text numberOfLines={1} style={[styles.title, { color: t.text, flexShrink: 1 }]}>
                  {c.title}
                </Text>
                {c.supportDesk && <Text style={styles.supportTag}>{tr.support.title}</Text>}
              </View>
              {status === "offline" || status === "connecting" ? (
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  {status === "offline" ? tr.chats.waitingForNetwork : tr.common.connecting}
                </Text>
              ) : typing ? (
                <Text style={{ color: brand, fontSize: 12, fontWeight: "600" }}>{tr.chats.typing[typing]}</Text>
              ) : (
                (presence || c.muted || c.archived || !!c.autoDeleteSecs || c.support || c.withSupport || c.group) && (
                  <Text numberOfLines={2} style={{ color: presence?.online ? brand : t.muted, fontSize: 12 }}>
                    {[
                      c.group && tr.groups.members(c.members.length),
                      c.support && tr.support.title,
                      c.withSupport && tr.support.team,
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
          {!isBotChat(c) && (
            <>
              <IconButton
                Icon={Search}
                label={tr.chat.search}
                onPress={() => {
                  setSearchFor("");
                  setShared("search");
                }}
              />
              <IconButton
                Icon={Images}
                label={tr.chat.sharedMedia}
                onPress={() => {
                  setSearchFor("");
                  setShared("media");
                }}
              />
            </>
          )}
          {c.encrypted && !frozen && !c.withSupport && !c.group && (
            <>
              <IconButton Icon={Phone} label={tr.chat.voiceCall} disabled={inCall} onPress={() => void startCall(c, false)} />
              <IconButton Icon={Video} label={tr.chat.videoCall} disabled={inCall} onPress={() => void startCall(c, true)} />
            </>
          )}
          <IconButton Icon={MoreVertical} label={tr.chat.options} onPress={() => setMenu(true)} />
        </ScreenHeader>
      )}

      {!selecting && pin && (
        <PinnedBar
          message={pin}
          label={pins.length > 1 ? tr.messages.pinnedOf(pins.indexOf(pin) + 1, pins.length) : tr.messages.pinnedMessage}
          meId={meId}
          onJump={() => {
            list.current?.jumpTo(pin.id);
            setPinIndex((pins.indexOf(pin) + 1) % pins.length);
          }}
          onUnpin={frozen ? undefined : () => void updateChatSettings(qc, chatId, { unpin: pin.id }).catch(() => null)}
        />
      )}
      {!c.group && keyChanges.includes(peer.id) && !selecting && !c.withSupport && (
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
        {!selecting && c.supportClosedAt && (
          <Text style={[styles.closed, { color: t.muted, borderColor: t.border }]}>
            {c.supportDesk ? tr.support.closedDesk : tr.support.closed}
          </Text>
        )}
        {!selecting &&
          (frozen || readOnlyGroup(c) ? (
            <ChatBlocked chat={c} peerId={peer.id} peerName={peer.displayName} />
          ) : isBotChat(c) ? (
            <BotGames />
          ) : (
            <Composer
              chatId={chatId}
              nameOf={nameOf}
              scheduledCount={c.scheduledCount}
              limited={c.support || c.withSupport}
              onSent={() => list.current?.scrollToBottom()}
              onSearch={(q) => {
                setSearchFor(q);
                setShared("search");
              }}
            />
          ))}
      </KeyboardAvoidingView>

      {menu && (
        <ChatMenu
          chat={c}
          peerName={peer.displayName}
          peerId={peer.id}
          onClose={() => setMenu(false)}
          onGroupInfo={() => setEditing(true)}
          onDeleted={(scope) => scope === "me" && router.replace("/")}
          onChooseMessages={chooseMessages}
        />
      )}
      {shared && (
        <SharedMedia
          chat={c}
          initial={shared}
          query={searchFor}
          onJump={(id) => {
            setShared(null);
            list.current?.jumpTo(id);
          }}
          onClose={() => setShared(null)}
        />
      )}
      {editing &&
        (c.group ? (
          <GroupInfo chat={c} onClose={() => setEditing(false)} />
        ) : (
          <ContactEditor userId={peer.id} onClose={() => setEditing(false)} />
        ))}
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
  supportTag: {
    color: brand,
    backgroundColor: "rgba(235,138,0,0.15)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
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
  pinned: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pinnedText: { flex: 1, borderLeftWidth: 2, borderLeftColor: brand, paddingLeft: 8, paddingVertical: 2 },
  peer: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingVertical: 2, paddingRight: 8 },
  closed: { fontSize: 13, textAlign: "center", paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
