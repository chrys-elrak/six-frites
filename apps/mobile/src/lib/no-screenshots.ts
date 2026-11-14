import { useFocusEffect } from "expo-router";
import { addScreenshotListener, allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";
import { useCallback, useId } from "react";
import { reportScreenshot } from "./actions";

const allowed = !!process.env.EXPO_PUBLIC_ALLOW_SCREEN_CAPTURE;

/**
 * Blocks screenshots and screen recording while the calling screen is in front. Each screen has its own key, so
 * leaving the chat list for a chat doesn't lift the chat's block. With `chatId`, a screenshot taken there, or only
 * tried since it's blocked, is told to the others in that chat, at most every 10 seconds. iOS and Android 14 and up
 * report blocked attempts; older Android never learns of them.
 */
export function useNoScreenshots(chatId?: string) {
  const key = useId();
  useFocusEffect(
    useCallback(() => {
      if (!allowed) void preventScreenCaptureAsync(key);
      let last = 0;
      const sub = chatId
        ? addScreenshotListener(() => {
            if (Date.now() - last < 10_000) return;
            last = Date.now();
            reportScreenshot(chatId, !allowed);
          })
        : null;
      return () => {
        sub?.remove();
        if (!allowed) void allowScreenCaptureAsync(key);
      };
    }, [key, chatId]),
  );
}
