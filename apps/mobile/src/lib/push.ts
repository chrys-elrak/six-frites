import { unwrap } from "@six/sdk";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { type Href, router } from "expo-router";
import { useEffect } from "react";
import { Linking, Platform } from "react-native";
import { getLocale, getT } from "./i18n";
import { useNotifyPrefs } from "./notify-prefs";
import { six } from "./six";

const provider = Platform.OS === "ios" ? "apns" : Constants.expoConfig?.extra?.playStore ? "fcmPlay" : "fcm";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Shows a message as a system notification while the app is open, like Messenger, on a silent channel since the app
 * plays its own tone. A newer one from the same chat replaces it. False when notifications are turned off.
 */
export async function showBanner(tag: string, title: string, body: string, url: string) {
  if (!(await Notifications.getPermissionsAsync()).granted) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: tag,
    content: { title, body, data: { url } },
    trigger: { channelId: "in-app" },
  });
  return true;
}

/** Clears a chat's notifications, pushed or shown in the app, once it's open. */
export const clearChatNotifications = (chatId: string) => void Notifications.dismissNotificationAsync(chatId).catch(() => null);

async function saveToken(token: string) {
  const tone = useNotifyPrefs.getState().tone;
  unwrap(await six.api.POST("/v1/devices/push-token", { body: { provider, token, locale: getLocale(), tone } }));
}

/**
 * Android rings whatever sound a channel was made with, and that can't change, so messages go to a channel made for
 * the picked tone; the server sends them there. The other tones' channels go, so settings show one Messages channel.
 */
async function messagesChannel() {
  const tone = useNotifyPrefs.getState().tone;
  const id = `messages-${tone}`;
  await Notifications.setNotificationChannelAsync(id, {
    name: getT().settings.messagesChannel,
    importance: AndroidImportance.HIGH,
    sound: `${tone}.wav`,
  });
  for (const channel of await Notifications.getNotificationChannelsAsync()) {
    if (channel.id.startsWith("messages") && channel.id !== id) await Notifications.deleteNotificationChannelAsync(channel.id);
  }
}

/** Links this phone's push token to the signed-in session, asking for permission first when `ask` is set. */
async function register(ask: boolean) {
  if (Platform.OS === "android") await messagesChannel();
  await Notifications.setNotificationChannelAsync("in-app", {
    name: getT().settings.inAppChannel,
    importance: AndroidImportance.HIGH,
    sound: null,
  });
  await Notifications.setNotificationChannelAsync("uploads", {
    name: getT().settings.uploadsChannel,
    importance: AndroidImportance.LOW,
    sound: null,
  });
  const permission = ask ? await Notifications.requestPermissionsAsync() : await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await saveToken((await Notifications.getDevicePushTokenAsync()).data);
}

/** Re-sends this phone's push token, without prompting, so notifications follow a language or tone change. */
export const registerPush = () => register(false);

useNotifyPrefs.subscribe((now, before) => {
  if (now.tone !== before.tone) void registerPush().catch(() => null);
});

/** Keeps this phone registered for push while signed in, and opens the chat behind a tapped notification. */
export function usePush() {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    void register(true).catch(() => null);
    const sub = Notifications.addPushTokenListener((t) => void saveToken(t.data).catch(() => null));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const data = response?.notification.request.content.data;
    if (typeof data?.url === "string" && data.url.startsWith("/")) router.push(data.url as Href);
    else if (typeof data?.chatId === "string") router.push(`/chats/${data.chatId}`);
    else if (typeof data?.url === "string" && data.url.startsWith("https://")) void Linking.openURL(data.url);
    else return;
    Notifications.clearLastNotificationResponse();
  }, [response]);
}
