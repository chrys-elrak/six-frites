"use client";

import { useEffect, useState } from "react";
import { playChime, unlockAudio, useNotifyPrefs } from "@/lib/notify";
import { disablePush, enablePush, pushSupported } from "@/lib/push";
import { Card, SectionTitle, Toggle } from "./ui";

export function NotificationSettings() {
  const prefs = useNotifyPrefs();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const [pushState, setPushState] = useState<"idle" | "working" | "denied" | "unavailable">("idle");

  async function setPush(on: boolean) {
    setPushState("working");
    try {
      if (!on) {
        await disablePush();
        prefs.set({ push: false });
        setPushState("idle");
        return;
      }
      const result = await enablePush();
      prefs.set({ push: result === "on" });
      setPushState(result === "on" ? "idle" : result);
      if ("Notification" in window) setPermission(Notification.permission);
    } catch {
      setPushState("idle");
    }
  }

  async function setSystem(on: boolean) {
    if (!on) return prefs.set({ system: false });
    const result = await Notification.requestPermission();
    setPermission(result);
    prefs.set({ system: result === "granted" });
  }

  const systemHint =
    permission === "unsupported"
      ? "Not supported in this browser."
      : permission === "denied"
        ? "Blocked in your browser's site settings."
        : "Shows a notification when Six Frites is in the background.";

  return (
    <section className="space-y-3">
      <SectionTitle>Notifications</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        <Toggle
          label="Sound"
          hint="Plays a short chime for new messages."
          checked={prefs.sound}
          onChange={(on) => {
            prefs.set({ sound: on });
            if (on) void unlockAudio().then(playChime);
          }}
        />
        <Toggle
          label="Popups"
          hint="Shows new messages from other chats while you use the app."
          checked={prefs.popups}
          onChange={(on) => prefs.set({ popups: on })}
        />
        <Toggle
          label="When Six Frites is closed"
          hint={
            pushState === "unavailable" || !pushSupported()
              ? "Not available in this browser."
              : pushState === "denied" || permission === "denied"
                ? "Blocked in your browser's site settings."
                : "Get notified even when no Six Frites tab is open."
          }
          checked={prefs.push}
          disabled={pushState === "working" || !pushSupported() || permission === "denied"}
          onChange={(on) => void setPush(on)}
        />
        <Toggle
          label="System notifications"
          hint={systemHint}
          checked={prefs.system && permission === "granted"}
          disabled={permission === "unsupported" || permission === "denied"}
          onChange={(on) => void setSystem(on)}
        />
      </Card>
    </section>
  );
}
