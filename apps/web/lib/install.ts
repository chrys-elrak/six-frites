"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

/** Chrome and Edge's offer to install the site, held back so our own button can show it. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

const standalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const iOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const useInstall = create<{ prompt: InstallPrompt | null; installed: boolean }>(() => ({ prompt: null, installed: false }));

if (typeof window !== "undefined") {
  useInstall.setState({ installed: standalone() });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    useInstall.setState({ prompt: e as InstallPrompt });
  });
  window.addEventListener("appinstalled", () => useInstall.setState({ installed: true, prompt: null }));
}

/**
 * How Six Frites can be installed here: through the browser's own prompt (Chrome and Edge on a computer), by hand
 * from the Share menu on an iPhone or iPad, or null when it already is, or on Android, which has its own app.
 */
export function useInstallWay(): "prompt" | "ios" | null {
  const { prompt, installed } = useInstall();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || installed) return null;
  if (iOS()) return "ios";
  return prompt && !/Android/.test(navigator.userAgent) ? "prompt" : null;
}

export async function install() {
  const prompt = useInstall.getState().prompt;
  if (!prompt) return;
  await prompt.prompt();
  useInstall.setState({ prompt: null });
}
