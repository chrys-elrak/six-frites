import { unwrap } from "@six/sdk";
import type { Locale } from "@six/shared";
import { useEffect, useRef } from "react";
import { setLocale, useLocale } from "./i18n";
import { useSession } from "./session";
import { six } from "./six";

/**
 * Keeps this device on the account's language. A language picked here goes to the account, one picked on another
 * device comes here, and an account without one yet takes this device's.
 */
export function LocaleSync() {
  const { locale, ready } = useLocale();
  const signedIn = useSession((s) => !!s.user);
  const account = useSession((s) => s.user?.locale);
  const known = useRef<Locale | null | undefined>(undefined);

  useEffect(() => {
    if (!ready || !signedIn || account === undefined) {
      known.current = undefined;
      return;
    }
    const save = (l: Locale) => {
      known.current = l;
      void six.api
        .PATCH("/v1/me", { body: { locale: l } })
        .then((res) => useSession.getState().setUser(unwrap(res)))
        .catch(() => null);
    };
    if (account !== known.current) {
      known.current = account;
      if (account === null) save(locale);
      else if (account !== locale) setLocale(account);
    } else if (locale !== account) save(locale);
  }, [ready, signedIn, account, locale]);

  return null;
}
