"use client";

import { fromB64, sealToLinkKey, utf8 } from "@six/crypto";
import { useEffect, useState } from "react";
import { finishFacebook, goToFacebook, shareFacebookResult } from "@/lib/facebook-sign-in";
import { useT } from "@/lib/i18n";

const BACK = "sixfrites://auth";

async function run(): Promise<string | "tab" | null> {
  if (!new URLSearchParams(location.search).has("state")) {
    await goToFacebook();
    return new Promise(() => {});
  }
  const { pub, ...result } = await finishFacebook();
  if (pub) {
    if (result.error) return `${BACK}?error=${result.error}`;
    return result.idToken ? `${BACK}?box=${sealToLinkKey(fromB64(pub), utf8(result.idToken))}` : BACK;
  }
  shareFacebookResult(result);
  window.close();
  return "tab";
}

let started: Promise<string | "tab" | null> | null = null;

export default function FacebookSignIn() {
  const tr = useT();
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    started ??= run().catch(() => {
      shareFacebookResult({ error: "INVALID_LOGIN_TOKEN" });
      return "tab";
    });
    void started.then((url) => {
      setBack(url);
      if (url && url !== "tab") location.replace(url);
    });
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      {back === "tab" ? (
        <p className="text-stone-500">{tr.auth.backToTab}</p>
      ) : back ? (
        <a href={back} className="rounded-full bg-brand px-6 py-3 font-semibold text-white">
          {tr.auth.backToApp}
        </a>
      ) : (
        <p className="text-stone-500">{tr.auth.signingIn}</p>
      )}
    </main>
  );
}
