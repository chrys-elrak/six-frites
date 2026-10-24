export function timeAgo(iso: string) {
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function inviteUrl(code: string) {
  return `${window.location.origin}/invite/${code}`;
}

export async function shareInvite(code: string): Promise<"shared" | "copied"> {
  const url = inviteUrl(code);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join me on Six Frites", url });
      return "shared";
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return "shared";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
