import { type Href, router } from "expo-router";

const TABS = new Set(["/", "/contacts", "/notifications", "/inbox", "/settings"]);

/**
 * Opens an in-app link. A tab pops back to the tab bar already beneath the open screens instead of pushing a second
 * one (the tab bar itself can't pop, so there it just switches tab); anything else is pushed on top.
 */
export function openHref(href: string) {
  if (TABS.has(href.split("?")[0]!) && router.canDismiss()) router.dismissTo(href as Href);
  else router.push(href as Href);
}
