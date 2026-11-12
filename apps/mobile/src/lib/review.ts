import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as StoreReview from "expo-store-review";
import { Platform } from "react-native";
import { useAppLock } from "./app-lock";
import { useCall } from "./calls";
import { useSession } from "./session";

const KEY = "six.review";
const DAYS_USED = 5;
const ASK_EVERY_MS = 120 * 24 * 60 * 60 * 1000;
const canReview = Platform.OS === "ios" || !!Constants.expoConfig?.extra?.playStore;

/**
 * Counts the days the chats were opened on and, once there were a few and the last ask was four months ago, asks
 * for a store rating, unless a call or the lock screen is up. `returning` is false on the first look at the chats
 * after signing in or opening the app, when what's new, the terms and the tour come up. Google Play and the App
 * Store still decide whether their sheet really shows. Android only asks in the Google Play build, since Play can't
 * rate an app installed from Koera Store.
 *
 * ponytail: days are counted on this phone; move the ask to a happier moment (a call that went well, a first game)
 * if the ratings it brings are poor.
 */
export async function askForReviewSometimes(returning: boolean) {
  const user = useSession.getState().user;
  if (!canReview || !user || user.guest) return;
  const today = new Date().toDateString();
  const saved: { days: number; lastDay?: string; askedAt?: number } = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{"days":0}');
  const days = saved.lastDay === today ? saved.days : saved.days + 1;
  const busy = !!useCall.getState().call || (user.hasAppLock && useAppLock.getState().locked);
  const ask =
    returning &&
    !busy &&
    days >= DAYS_USED &&
    Date.now() - (saved.askedAt ?? 0) >= ASK_EVERY_MS &&
    (await StoreReview.isAvailableAsync());
  await AsyncStorage.setItem(KEY, JSON.stringify({ days, lastDay: today, askedAt: ask ? Date.now() : saved.askedAt }));
  if (ask) await StoreReview.requestReview();
}
