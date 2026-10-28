"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/session";

const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

declare global {
  interface Window {
    adsbygoogle?: object[];
  }
}

function Slot() {
  const ins = useRef<HTMLModElement>(null);
  useEffect(() => {
    if (ins.current?.dataset.adsbygoogleStatus) return;
    try {
      (window.adsbygoogle ??= []).push({});
    } catch {}
  }, []);

  return (
    <div className="h-[50px] shrink-0 border-t border-stone-200 md:h-[90px] dark:border-stone-800">
      <Script
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
      />
      <ins
        ref={ins}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", height: "100%" }}
        data-ad-client={client}
        data-ad-slot={slot}
      />
    </div>
  );
}

/** An AdSense banner, unless AdSense isn't set up or an admin turned ads off for this user. */
export function AdBanner() {
  const ads = useSession((s) => !!s.user?.ads);
  return client && slot && ads ? <Slot /> : null;
}
