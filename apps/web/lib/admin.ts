import { unwrap } from "@six/sdk";
import { BAN_HOURS, type ReportReason } from "@six/shared";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useSession } from "./session";
import { six } from "./six";

export const adminKeys = {
  me: ["admin", "me"] as const,
  stats: ["admin", "stats"] as const,
  users: (q: string, banned: boolean) => ["admin", "users", q, banned] as const,
  reports: (status: "open" | "resolved") => ["admin", "reports", status] as const,
  largeFiles: ["admin", "large-files"] as const,
  anon: (q: string) => ["admin", "anon", q] as const,
};

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "illegal", label: "Something illegal" },
  { value: "other", label: "Something else" },
];

export const reasonLabel = (r: ReportReason) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;

/** The ban lengths to pick from; no hours means until an admin lifts it. */
export const BAN_LENGTHS: { hours?: number; label: string }[] = [
  ...BAN_HOURS.map((hours) => ({ hours, label: hours < 48 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours / 24} days` })),
  { label: "For good" },
];

export const banEnd = (until: string) => new Date(until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Refetches every admin list and the stats after a moderation action. */
export function refreshAdmin(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "admin" && q.queryKey[1] !== "me" });
}

/** True for the emails the server lists in ADMIN_EMAILS; anyone else gets a 403 and sees nothing. */
export function useIsAdmin() {
  const authed = useSession((s) => s.status === "authed");
  return useQuery({
    queryKey: adminKeys.me,
    queryFn: async () => {
      const res = await six.api.GET("/v1/admin/me");
      return res.response.ok ? unwrap(res).admin : false;
    },
    enabled: authed,
    staleTime: Infinity,
    retry: false,
  });
}
