import {
  CHAT_FILTERS,
  type ChatDTO,
  type ContactDTO,
  type ChatFilter,
  inChatFilter,
  chatFace,
  isGroupAction,
  lastMessageDelivery,
  maskSpoilers,
  mentionAsYou,
  senderName,
  serviceSentence,
  serviceText,
  shownType,
  CONTACT_SORTS,
  type ContactSort,
  sortContacts,
} from "@six/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import {
  Archive,
  ArchiveRestore,
  Ban,
  AlertCircle,
  BellOff,
  Check,
  CheckCheck,
  ChevronLeft,
  Clock,
  EyeOff,
  Flame,
  Ghost,
  Camera,
  Gamepad2,
  Lock,
  MessageCircle,
  Palette,
  Phone,
  PhoneMissed,
  Pin,
  PinOff,
  QrCode,
  RefreshCw,
  Search,
  Headset,
  Share2,
  Timer,
  UserPlus,
  Video,
  MessagesSquare,
} from "lucide-react-native";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { removeContact, updateChatSettings } from "@/lib/actions";
import { Sheet } from "./sheet";
import { useSwipeRow } from "@/lib/swipe";
import { Text, TextInput } from "./text";
import { ensureBotChat, isFrozen, useChats } from "@/lib/chats";
import { useHydratedMessage } from "@/lib/e2ee";
import { calendarDate, formatDuration, listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useHiddenByArchive } from "@/lib/archive-lock";
import { useAppLock } from "@/lib/app-lock";
import { useSession } from "@/lib/session";
import { brand, brandInk, flame, stone, useTheme } from "@/lib/theme";
import { presenceLabel, usePresence, usePresenceStore, useWatchPresence } from "@/lib/presence";
import { useTyping } from "@/lib/typing";
import { receiveDraft, useDrafts } from "@/lib/drafts";
import { useOutbox } from "@/lib/outbox";
import { six } from "@/lib/six";
import { AddContact } from "./add-contact";
import { NewGroup } from "./groups";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";
import { BackupPinBanner } from "./encryption-settings";
import { InviteNudge, TipCard } from "./tip-card";
import { NewInvite } from "./invites";
import { FindMe, Invites } from "./settings-panel";
import { StoriesBar, StoryAvatar } from "./stories";
import { MediaIcon, type MediaType, mediaLabel } from "./media-label";
import { BrandBar } from "./brand-bar";
import { EmptyState, IconButton, Popup, PrimaryButton, ScreenHeader } from "./ui";
import { UpdateBanner } from "./update-banner";

function Preview({ chat, meId, color, bold }: { chat: ChatDTO; meId: string; color: string; bold: boolean }) {
  const tr = useT();
  const ink = { color, fontWeight: bold ? "600" : "400" } as const;
  const m = useHydratedMessage(meId, chat.lastMessage) as
    | (NonNullable<ChatDTO["lastMessage"]> & { undecryptable?: boolean; decrypting?: boolean })
    | null;
  const line = (icon: React.ReactNode, text: string, italic = false) => (
    <View style={styles.previewRow}>
      {icon}
      <Text numberOfLines={1} style={[styles.preview, ink, italic && { fontStyle: "italic" }]}>
        {text}
      </Text>
    </View>
  );
  const you =
    m?.senderId === meId ? tr.chats.youPrefix : chat.group && m ? `${senderName(chat, m.senderId, tr)}: ` : "";

  if (!m) return line(null, tr.chats.noMessages);
  if (m.deletedAt) return line(<Ban size={14} color={color} />, tr.summary.messageDeleted, true);
  if (m.type === "service") {
    const icon =
      m.action?.type === "theme" ? (
        <Palette size={14} color={color} />
      ) : m.action?.type === "e2ee" ? (
        <Lock size={14} color={color} />
      ) : m.action?.type === "vanish" ? (
        <Ghost size={14} color={color} />
      ) : m.action?.type === "screenshot" ? (
        <Camera size={14} color={color} />
      ) : m.action?.type === "resend_request" ? (
        <RefreshCw size={14} color={color} />
      ) : m.action?.type === "shared_to" ? (
        <Share2 size={14} color={color} />
      ) : m.action?.type === "call" ? (
        m.action.secs === null ? (
          <PhoneMissed size={14} color={color} />
        ) : m.action.video ? (
          <Video size={14} color={color} />
        ) : (
          <Phone size={14} color={color} />
        )
      ) : m.action?.type === "live_invite" || m.action?.type === "live_result" ? (
        <Gamepad2 size={14} color={color} />
      ) : isGroupAction(m.action) ? (
        <MessagesSquare size={14} color={color} />
      ) : (
        <Timer size={14} color={color} />
      );
    const mine = m.senderId === meId;
    return line(
      icon,
      chat.group ? serviceSentence(m, mine ? null : senderName(chat, m.senderId, tr), tr) : serviceText(m, tr, mine),
    );
  }
  if (m.undecryptable || m.decrypting) {
    return line(<Lock size={14} color={color} />, m.decrypting ? tr.chats.decrypting : tr.chats.encryptedMessage, true);
  }
  if (m.ephemeral) {
    return line(
      <>
        {you ? <Text style={[styles.preview, ink]}>{you}</Text> : null}
        <Flame size={14} color={flame} />
      </>,
      m.ephemeral.expired ? tr.chats.opened : tr.chats.selfDestructing[m.type],
    );
  }
  if (m.bump) return line(null, `${you}${tr.messages.bumped}${m.replyTo?.text ? ` · ${m.replyTo.text}` : ""}`);
  if (m.type !== "text") {
    const type = shownType(m as typeof m & { file?: { sticker?: boolean } }) as MediaType;
    const voiceLength =
      m.type === "voice" && m.attachment?.durationMs ? ` (${formatDuration(m.attachment.durationMs)})` : "";
    const extra =
      m.type === "file" && m.attachment && !m.text
        ? ` · ${m.attachment.name}`
        : m.type === "checklist" && m.checklist
          ? ` · ${m.checklist.title}`
          : m.type === "poll" && m.poll
            ? ` · ${m.poll.question}`
            : m.type === "game" && m.game
            ? ` · ${tr.calls[m.game.game]}`
            : m.text
              ? ` · ${mentionAsYou(maskSpoilers(m.text, m.entities), chat, meId, tr.common.you)}`
              : "";
    return line(
      <>
        {you ? <Text style={[styles.preview, ink]}>{you}</Text> : null}
        <MediaIcon type={type} color={color} />
      </>,
      `${mediaLabel(type, tr)}${voiceLength}${extra}`,
    );
  }
  if (m.spoiler) {
    return line(
      <>
        {you ? <Text style={[styles.preview, ink]}>{you}</Text> : null}
        <EyeOff size={14} color={color} />
      </>,
      tr.summary.spoiler,
      true,
    );
  }
  return line(null, you + mentionAsYou(maskSpoilers(m.text ?? "", m.entities), chat, meId, tr.common.you).replace(/\s+/g, " "));
}

function ChatRow({ chat, meId }: { chat: ChatDTO; meId: string }) {
  const t = useTheme();
  const tr = useT();
  const [menu, setMenu] = useState(false);
  const typing = useTyping(chat);
  const draft = useDrafts((s) => s.byChat[chat.id]);
  const unsent = useOutbox((s) => {
    const pending = s.byChat[chat.id];
    return pending?.find((m) => m.status === "failed") ?? pending?.find((m) => m.status === "waiting");
  });
  const pullDraft = useEffectEvent(() => void receiveDraft(chat));
  useEffect(() => pullDraft(), [chat.id, chat.encrypted, chat.draft?.at]);
  const peer = chatFace(chat, meId);
  const online = usePresence(chat.group || peer.id === meId || isFrozen(chat) ? undefined : peer.id)?.online;
  const unread = chat.unreadCount > 0;
  const loud = unread && !chat.muted;
  const delivery = unsent || draft ? null : lastMessageDelivery(chat, meId);
  const Tick = delivery === "sent" ? Check : CheckCheck;
  const qc = useQueryClient();
  const settings = (input: Parameters<typeof updateChatSettings>[2]) =>
    void updateChatSettings(qc, chat.id, input).catch(() => null);
  const swipe = useSwipeRow(
    () => settings({ pinned: !chat.pinned }),
    () => settings({ archived: !chat.archived }),
  );

  return (
    <>
      <GestureDetector gesture={swipe.gesture}>
        <View>
          <Animated.View pointerEvents="none" style={[styles.swipeHint, { left: 20 }, swipe.right]}>
            <View style={[styles.swipeIcon, { backgroundColor: brand }]}>
              {chat.pinned ? <PinOff size={20} color={brandInk} /> : <Pin size={20} color={brandInk} />}
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.swipeHint, { right: 20 }, swipe.left]}>
            <View style={[styles.swipeIcon, { backgroundColor: stone[500] }]}>
              {chat.archived ? <ArchiveRestore size={20} color="#fff" /> : <Archive size={20} color="#fff" />}
            </View>
          </Animated.View>
          <Animated.View style={swipe.moving}>
            <Pressable
              onPress={() => router.push(`/chats/${chat.id}`)}
              onLongPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMenu(true);
              }}
              style={({ pressed }) => [styles.row, loud && { backgroundColor: `${brand}1A` }, pressed && { backgroundColor: t.pressed }]}
            >
              {chat.group ? (
                <View>
                  <Avatar user={peer} size="md" />
                  <View accessibilityLabel={tr.groups.group} style={[styles.groupBadge, { borderColor: t.bg }]}>
                    <MessagesSquare size={11} color="#fff" strokeWidth={2.5} />
                  </View>
                </View>
              ) : (
                <StoryAvatar userId={peer.id} name={chat.title}>
                  <Avatar user={peer} size="md" online={!!online} />
                </StoryAvatar>
              )}
              <View style={styles.rowBody}>
                <View style={styles.rowLine}>
                  <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
                    {chat.title}
                  </Text>
                  {chat.supportDesk && <Text style={styles.supportTag}>{tr.support.title}</Text>}
                  <View style={{ flex: 1 }} />
                  {chat.muted && <BellOff size={14} color={t.faint} accessibilityLabel={tr.common.muted} />}
                  {delivery && (
                    <Tick size={16} strokeWidth={2.5} color={delivery === "read" ? t.read : t.faint} accessibilityLabel={tr.messages.status[delivery]} />
                  )}
                  <Text style={[styles.time, unread ? { color: brand, fontWeight: "600" } : { color: t.muted }]}>
                    {listTime(chat.lastActivityAt)}
                  </Text>
                </View>
                <View style={styles.rowLine}>
                  <View style={{ flex: 1 }}>
                    {typing ? (
                      <Text style={[styles.preview, { color: brand, fontWeight: "500" }]}>{typing}</Text>
                    ) : unsent ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {unsent.status === "failed" ? <AlertCircle size={14} color={t.danger} /> : <Clock size={14} color={t.muted} />}
                        <Text numberOfLines={1} style={[styles.preview, { color: unsent.status === "failed" ? t.danger : t.muted }]}>
                          {unsent.status === "failed" ? tr.messages.notSent : tr.chats.waitingForNetwork}
                        </Text>
                      </View>
                    ) : draft ? (
                      <Text numberOfLines={1} style={[styles.preview, { color: t.muted }]}>
                        <Text style={{ color: t.danger }}>{tr.chats.draft}</Text> {draft.replace(/\s+/g, " ")}
                      </Text>
                    ) : (
                      <Preview chat={chat} meId={meId} color={unread ? t.text : t.muted} bold={loud} />
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
          </Animated.View>
        </View>
      </GestureDetector>
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

function ContactRow({ contact, sort }: { contact: ContactDTO; sort: ContactSort }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const presence = usePresence(contact.user.id);
  const online = presence?.online;
  const seen = presenceLabel(presence);
  const added = tr.contacts.addedOn(calendarDate(contact.addedAt));
  const details = (sort === "added" ? [added, seen] : [seen, added]).filter(Boolean).join(" · ");
  const [menu, setMenu] = useState<"menu" | "remove" | null>(null);
  const name = contact.user.displayName;
  return (
    <>
      <Pressable
        onPress={() => router.push(`/chats/${contact.chatId}`)}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMenu("menu");
        }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.pressed }]}
      >
        <StoryAvatar userId={contact.user.id} name={name}>
          <Avatar user={contact.user} size="md" online={!!online} />
        </StoryAvatar>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
            {name}
          </Text>
          <Text numberOfLines={1} style={{ color: online ? "#16a34a" : t.muted, fontSize: 13 }}>
            {details}
          </Text>
        </View>
      </Pressable>
      {menu === "menu" && (
        <Sheet
          title={name}
          onClose={() => setMenu(null)}
          actions={[
            { label: tr.contacts.openChat, onSelect: () => router.push(`/chats/${contact.chatId}`) },
            { label: tr.chat.removeContact(name), destructive: true, keepOpen: true, onSelect: () => setMenu("remove") },
          ]}
        />
      )}
      {menu === "remove" && (
        <Sheet
          title={tr.chat.removeContactConfirm(name)}
          onClose={() => setMenu(null)}
          actions={[
            {
              label: tr.chat.removeContact(name),
              destructive: true,
              onSelect: () => void removeContact(qc, contact.chatId, contact.user.id).catch(() => null),
            },
          ]}
        />
      )}
    </>
  );
}

const SORT_KEY = "six:contact-sort";

const contactsQuery = {
  queryKey: ["contacts"],
  staleTime: 0,
  queryFn: async () => unwrap(await six.api.GET("/v1/contacts", { params: { query: { limit: 200 } } })).items,
};

/**
 * Everyone I share a direct chat with, A to Z, by last active or by newest, even the chats I deleted for me, and
 * opens our chat.
 */
function ContactList({ needle, query, top }: { needle: string; query: string; top: React.ReactNode }) {
  const t = useTheme();
  const tr = useT();
  const [sort, setSort] = useState<ContactSort>("active");
  const presence = usePresenceStore((s) => s.byUser);
  useEffect(() => {
    void AsyncStorage.getItem(SORT_KEY)
      .then((saved) => saved && (CONTACT_SORTS as readonly string[]).includes(saved) && setSort(saved as ContactSort))
      .catch(() => null);
  }, []);
  function pickSort(next: ContactSort) {
    setSort(next);
    void AsyncStorage.setItem(SORT_KEY, next).catch(() => null);
  }
  const contacts = useQuery(contactsQuery);
  const hidden = useHiddenByArchive().chatIds;
  const matching = contacts.data?.filter((c) => !hidden.has(c.chatId) && c.user.displayName.toLowerCase().includes(needle)) ?? [];
  useWatchPresence(matching.map((c) => c.user.id));
  const shown = sortContacts(matching, sort, (id) => presence[id]);

  return (
    <FlatList
      data={shown}
      ListHeaderComponent={
        <>
          {top}
          {shown.length > 1 && (
            <View accessibilityRole="radiogroup" accessibilityLabel={tr.contacts.sortBy} style={[styles.filters, styles.sortRow]}>
              {CONTACT_SORTS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => pickSort(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sort === s }}
                  style={[styles.filter, { backgroundColor: sort === s ? brand : t.chip }]}
                >
                  <Text style={{ color: sort === s ? brandInk : t.textSoft, fontSize: 14, fontWeight: "600" }}>{tr.contacts.sorts[s]}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      }
      keyExtractor={(c) => c.user.id}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <ContactRow contact={item} sort={sort} />}
      refreshControl={
        <RefreshControl
          refreshing={contacts.isRefetching}
          onRefresh={() => void contacts.refetch()}
          colors={[brand]}
          progressBackgroundColor={t.surface}
        />
      }
      ListEmptyComponent={
        <Text style={[styles.note, { color: contacts.isError ? t.danger : t.muted, textAlign: "center" }]}>
          {contacts.isPending
            ? tr.common.loading
            : contacts.isError
              ? tr.common.somethingWrong
              : needle
                ? tr.contacts.noMatch(query)
                : tr.contacts.none}
        </Text>
      }
    />
  );
}

type ListView = "chats" | "desk" | "contacts";

/**
 * The chat list, or with `archived` the archived chats, or with `contacts` my contacts. Whoever answers
 * support gets a switch at the bottom for the support chats.
 */
export function ChatList({ archived = false, contacts = false }: { archived?: boolean; contacts?: boolean }) {
  const t = useTheme();
  const tr = useT();
  const openSupport = async () => {
    try {
      router.push(`/chats/${unwrap(await six.api.POST("/v1/support")).id}`);
    } catch (err) {
      Alert.alert(tr.support.contact, (err as Error).message);
    }
  };
  const meId = useSession((s) => s.user!.id);
  const isSupport = useSession((s) => s.user!.support);
  const hasAppLock = useSession((s) => s.user!.hasAppLock);
  const chats = useChats(archived);
  const archivedChats = useChats(true);
  const qc = useQueryClient();
  useEffect(() => {
    if (!archived && chats.data) ensureBotChat(qc, chats.data);
  }, [archived, chats.data, qc]);
  const { status } = useRealtime();
  const statusText = {
    connecting: tr.common.connecting,
    syncing: tr.chats.updating,
    offline: tr.chats.waitingForNetwork,
    live: null,
  }[status];

  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"add" | "invite" | "findMe" | "group" | null>(null);
  const lonely = useQuery({ ...contactsQuery, enabled: !archived }).data?.length === 0;
  useEffect(() => {
    if (lonely) void qc.invalidateQueries({ queryKey: ["contacts"] });
  }, [chats.data?.length]);
  const [pulled, setPulled] = useState(false);
  useFocusEffect(useCallback(() => () => setPulled(false), []));
  const needle = query.trim().toLowerCase();
  const [picked, setPicked] = useState<ChatFilter>("all");
  const [viewPicked, setView] = useState<ListView>("chats");
  const hasDesk = !archived && !!chats.data?.some((c) => c.supportDesk);
  const views: ListView[] = hasDesk ? ["chats", "desk"] : ["chats"];
  const view = contacts ? "contacts" : !archived && views.includes(viewPicked) ? viewPicked : "chats";
  const desk = view === "desk";
  const unreadIn = (d: boolean) => chats.data?.filter((c) => c.supportDesk === d && c.unreadCount > 0).length ?? 0;
  const visible =
    chats.data?.filter((c) => c.lastMessage && (!hasDesk || c.supportDesk === desk) && c.title.toLowerCase().includes(needle)) ?? [];
  const filter = archived ? "all" : picked;
  const shown = visible.filter((c) => inChatFilter(c, filter));
  useWatchPresence(visible.filter((c) => !c.group).flatMap((c) => c.members.map((m) => m.user.id)).filter((id) => id !== meId));
  const archivedCount = archivedChats.data?.length ?? 0;
  const archivedUnread = archivedChats.data?.reduce((n, c) => n + c.unreadCount, 0) ?? 0;

  const tools = (
    <View style={{ gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
      {!archived && view === "chats" && !needle && <StoriesBar />}
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
      {!archived && view !== "contacts" && (
        <View style={styles.filters}>
          {CHAT_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setPicked(f)}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === f }}
              style={[styles.filter, { backgroundColor: filter === f ? brand : t.chip }]}
            >
              <Text style={{ color: filter === f ? brandInk : t.textSoft, fontSize: 14, fontWeight: "600" }}>
                {tr.chats.filters[f]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const { width, height } = useWindowDimensions();
  const scrollTools = width > height;
  const header = (
    <>
      {scrollTools && tools}
      {!archived && <UpdateBanner />}
      {!archived && <BackupPinBanner />}
      {!archived && (lonely ? <InviteNudge onInvite={() => setDialog("invite")} /> : <TipCard />)}
      {pulled && view === "chats" && !needle && archivedCount > 0 && (
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
      {archived ? (
        <ScreenHeader inset={false}>
          <IconButton Icon={ChevronLeft} label={tr.common.backToChats} onPress={() => router.back()} size={26} />
          <Text style={[styles.title, { color: t.text, flex: 1 }]}>{tr.common.archived}</Text>
        </ScreenHeader>
      ) : (
        <BrandBar>
          {statusText && <Text style={{ color: t.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{statusText}</Text>}
          {!isSupport && (
            <IconButton Icon={Headset} color={brand} label={tr.support.contact} onPress={() => void openSupport()} />
          )}
          {view === "contacts" && (
            <IconButton Icon={QrCode} color={brand} label={tr.settings.findMe} onPress={() => setDialog("findMe")} />
          )}
          {view !== "contacts" && (
            <IconButton Icon={MessagesSquare} color={brand} label={tr.groups.newGroup} onPress={() => setDialog("group")} />
          )}
          <IconButton Icon={Share2} color={brand} label={tr.contacts.inviteFriend} onPress={() => setDialog("invite")} />
          <IconButton Icon={UserPlus} color={brand} label={tr.contacts.addContact} onPress={() => setDialog("add")} />
          {hasAppLock && (
            <IconButton
              Icon={Lock}
              color={brand}
              label={tr.settings.appLock.lockNow}
              onPress={() => useAppLock.setState({ locked: true, archiveOpen: false })}
            />
          )}
        </BrandBar>
      )}
      {!scrollTools && tools}
      {view === "contacts" ? (
        <ContactList needle={needle} query={query.trim()} top={scrollTools ? tools : null} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ChatRow chat={item} meId={meId} />}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={chats.isRefetching}
              onRefresh={() => {
                setPulled((p) => !p);
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
            ) : visible.length ? (
              <Text style={[styles.note, { color: t.muted, textAlign: "center" }]}>{tr.chats.filterEmpty}</Text>
            ) : (
              <EmptyState
                Icon={archived ? Archive : desk ? Headset : MessageCircle}
                title={archived ? tr.chats.noArchived : tr.chats.noChats}
              >
                {!archived && !desk && (
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
      )}
      {!archived && view !== "contacts" && views.length > 1 && (
        <View style={[styles.tabs, { backgroundColor: t.chip, marginHorizontal: 12, marginVertical: 8 }]}>
          {views.map((v) => {
            const unread = unreadIn(v === "desk");
            return (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === v }}
                style={[styles.tab, view === v && { backgroundColor: t.surface }]}
              >
                <Text numberOfLines={1} style={{ color: view === v ? t.text : t.muted, fontSize: 14, fontWeight: "600" }}>
                  {v === "desk" ? tr.support.title : tr.common.chats}
                </Text>
                {unread > 0 && (
                  <View style={[styles.badge, { backgroundColor: brand }]}>
                    <Text style={[styles.badgeText, { color: brandInk }]}>{unread > 99 ? "99+" : unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
      {dialog === "add" && <AddContact onClose={() => setDialog(null)} />}
      {dialog === "group" && <NewGroup onClose={() => setDialog(null)} />}
      {dialog === "invite" && (
        <NewInvite onClose={() => setDialog(null)}>
          <Invites />
        </NewInvite>
      )}
      {dialog === "findMe" && (
        <Popup onClose={() => setDialog(null)}>
          <FindMe />
        </Popup>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: "#57534e",
    alignItems: "center",
    justifyContent: "center",
  },
  sortRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: "600" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tabs: { flexDirection: "row", borderRadius: 999, padding: 4 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 7, borderRadius: 999 },
  filter: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
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
  time: { fontSize: 12 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  preview: { fontSize: 14, flexShrink: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  archiveIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  archiveText: { flex: 1, fontSize: 15, fontWeight: "500" },
  note: { padding: 16, fontSize: 14 },
  swipeHint: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", opacity: 0 },
  swipeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
});
