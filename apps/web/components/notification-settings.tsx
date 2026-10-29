"use client";

import { TONES } from "@six/shared";
import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { playTone, unlockAudio, useNotifyPrefs } from "@/lib/notify";
import { disablePush, enablePush, pushSupported } from "@/lib/push";
import { Card, SectionTitle, Toggle } from "./ui";

export function NotificationSettings() {
  const tr = useT();
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
      ? tr.settings.notSupported
      : permission === "denied"
        ? tr.settings.blockedInBrowser
        : tr.settings.systemHint;

  return (
    <section className="space-y-3">
      <SectionTitle>{tr.settings.notifications}</SectionTitle>
      <Card className="divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">
        <Toggle
          label={tr.settings.sound}
          hint={tr.settings.soundHint}
          checked={prefs.sound}
          onChange={(on) => {
            prefs.set({ sound: on });
            if (on) void unlockAudio().then(() => playTone());
          }}
        />
        {prefs.sound && (
          <div className="flex flex-wrap gap-2 px-4 py-3" role="radiogroup" aria-label={tr.settings.sound}>
            {TONES.map((tone) => (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={prefs.tone === tone}
                onClick={() => {
                  prefs.set({ tone });
                  void unlockAudio().then(() => playTone(tone));
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                  prefs.tone === tone
                    ? "bg-brand text-brand-ink"
                    : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
                }`}
              >
                <Volume2 className="size-3.5" />
                {tr.settings.tones[tone]}
              </button>
            ))}
          </div>
        )}
        <Toggle
          label={tr.settings.popups}
          hint={tr.settings.popupsHint}
          checked={prefs.popups}
          onChange={(on) => prefs.set({ popups: on })}
        />
        <Toggle
          label={tr.settings.whenClosed}
          hint={
            pushState === "unavailable" || !pushSupported()
              ? tr.settings.notAvailable
              : pushState === "denied" || permission === "denied"
                ? tr.settings.blockedInBrowser
                : tr.settings.whenClosedHint
          }
          checked={prefs.push}
          disabled={pushState === "working" || !pushSupported() || permission === "denied"}
          onChange={(on) => void setPush(on)}
        />
        <Toggle
          label={tr.settings.systemNotifications}
          hint={systemHint}
          checked={prefs.system && permission === "granted"}
          disabled={permission === "unsupported" || permission === "denied"}
          onChange={(on) => void setSystem(on)}
        />
      </Card>
    </section>
  );
}
