import type { ChatDTO } from "@six/shared";
import { ChevronLeft, Lock, LockOpen } from "lucide-react-native";
import { useRef } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BubbleColors, BubbleColorsContext } from "@/lib/bubble-colors";
import { setCommentsClosed } from "@/lib/actions";
import { useMessages } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import { ChatBackground } from "./chat-background";
import { Composer } from "./composer";
import { MessageList, type MessageListHandle } from "./message-list";
import { Text } from "./text";
import { IconButton, ScreenHeader } from "./ui";

const noop = () => {};

/** A group message's comments, full screen: the message on top, the comments under it, and a box to add one unless closed. */
export function ThreadScreen({
  chat,
  meId,
  threadId,
  nameOf,
  bubble,
  onClose,
}: {
  chat: ChatDTO;
  meId: string;
  threadId: string;
  nameOf: (userId: string) => string;
  bubble: BubbleColors;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const list = useRef<MessageListHandle>(null);
  const root = useMessages(chat.id)
    .data?.pages.flatMap((p) => p.items)
    .find((m) => m.id === threadId);
  const closed = root?.thread?.closed ?? false;
  const count = root?.thread?.count ?? 0;
  const admin = !!chat.group && chat.group.myRole !== "member";

  return (
    <Modal animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ChatBackground themeId={chat.theme} />
        <ScreenHeader background={t.bar}>
          <IconButton Icon={ChevronLeft} label={tr.common.close} size={26} onPress={onClose} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]}>{tr.groups.commentsTitle}</Text>
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
              {closed ? "🔒 " : ""}
              {count ? tr.groups.comments(count) : tr.groups.noComments} · {chat.title}
            </Text>
          </View>
          {admin && root && (
            <IconButton
              Icon={closed ? LockOpen : Lock}
              label={closed ? tr.groups.reopenComments : tr.groups.closeComments}
              color={closed ? brand : undefined}
              onPress={() => void setCommentsClosed(threadId, !closed).catch(() => null)}
            />
          )}
        </ScreenHeader>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            <BubbleColorsContext.Provider value={bubble}>
              <MessageList ref={list} chat={chat} meId={meId} onSeen={noop} threadId={threadId} />
            </BubbleColorsContext.Provider>
          </View>
          {closed ? (
            <View style={[styles.closed, { backgroundColor: t.bar, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Lock size={16} color={t.muted} />
              <Text style={{ color: t.muted, fontSize: 14 }}>{tr.groups.commentsClosedHint}</Text>
            </View>
          ) : (
            <Composer
              chatId={chat.id}
              threadId={threadId}
              nameOf={nameOf}
              scheduledCount={0}
              onSent={() => list.current?.scrollToBottom()}
              onSearch={noop}
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "700" },
  closed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
