/** sixfrites://auth only hands a sign-in back to the browser tab waiting for it, so it stays on the login screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return /^(sixfrites:\/\/|\/)auth([?#]|$)/.test(path) ? "/login" : path;
}
