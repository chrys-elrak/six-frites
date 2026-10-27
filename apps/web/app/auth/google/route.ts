export const dynamic = "force-dynamic";

/**
 * Lands Google's redirect-mode POST (used on iOS, where the popup breaks). Hands the
 * ID token to the login page through sessionStorage, which checks it against the
 * nonce it stored before leaving, so a forged POST can't sign anyone in.
 */
export async function POST(req: Request) {
  const credential = (await req.formData()).get("credential");
  const token = typeof credential === "string" && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential) ? credential : "";
  const script = `try{const k="google-signin",s=JSON.parse(sessionStorage.getItem(k)||"{}");sessionStorage.setItem(k,JSON.stringify({...s,credential:"${token}"}));location.replace(s.back||"/login")}catch{location.replace("/login")}`;
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><script>${script}</script>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
