/**
 * Links that aren't screens: sixfrites://auth hands a sign-in back to the browser tab waiting for it, so it stays on
 * the login screen, and sixfrites://dataUrl=… is the iOS share extension handing over what was shared, which
 * expo-share-intent reads while the chats list shows.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (/^(sixfrites:\/\/|\/)auth([?#]|$)/.test(path)) return "/login";
  return path.includes("dataUrl=") ? "/" : path;
}
