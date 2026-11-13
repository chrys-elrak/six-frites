import { ReportReason } from "@six/shared";
import { useT } from "@/lib/i18n";
import { toastDone } from "@/lib/notify";
import { six } from "@/lib/six";
import { Sheet } from "./sheet";

/** Asks why, then sends a report on a chat message or a person to the moderators. */
export function ReportSheet({ target, onClose }: { target: { messageId: string } | { userId: string }; onClose: () => void }) {
  const tr = useT();

  async function report(reason: ReportReason) {
    const res = await six.api.POST("/v1/reports", { body: { ...target, reason } }).catch(() => null);
    toastDone(res?.response.ok ? tr.chat.reportThanks : tr.chat.reportFailed, !res?.response.ok);
  }

  return (
    <Sheet
      title={"messageId" in target ? tr.chat.reportMessageHint : tr.chat.reportUserHint}
      onClose={onClose}
      actions={ReportReason.options.map((r) => ({ label: tr.chat.reportReasons[r], onSelect: () => void report(r) }))}
    />
  );
}
