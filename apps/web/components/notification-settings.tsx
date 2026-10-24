"use client";

import { useEffect, useState } from "react";
import { playChime, unlockAudio, useNotifyPrefs } from "@/lib/notify";
import { disablePush, enablePush, pushSupported } from "@/lib/push";
import { Card, SectionTitle } from "./ui";

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-3 p-4 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-stone-500 dark:text-stone-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-stone-300 transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4 dark:bg-stone-700"
      />
    </label>
  );
}

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
