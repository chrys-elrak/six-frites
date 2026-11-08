import { COMMENT_RULES, type CommentRule } from "@six/shared";
import { MessageSquareOff } from "lucide-react-native";
import { useState } from "react";
import { Pressable } from "react-native";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import { Sheet } from "./sheet";

/** For a group admin: posts the next message with its comments closed, or closing after some comments or some time. */
export function CommentsPicker({
  value,
  onChange,
}: {
  value: CommentRule | null;
  onChange: (value: CommentRule | null) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const label = (r: CommentRule) =>
    r.commentsClosed
      ? tr.groups.commentsClosed
      : r.commentsLimit
        ? tr.groups.closeAfterComments(r.commentsLimit)
        : tr.groups.closeAfterHours(r.commentsCloseIn! / 3600);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={value ? label(value) : tr.groups.commentsRule}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MessageSquareOff size={22} color={value ? brand : t.faint} />
      </Pressable>
      {open && (
        <Sheet
          title={tr.groups.commentsRule}
          onClose={() => setOpen(false)}
          actions={[
            ...COMMENT_RULES.map((r) => ({
              label: label(r),
              onSelect: () => onChange(r),
            })),
            ...(value
              ? [
                  {
                    label: tr.groups.commentsOpen,
                    onSelect: () => onChange(null),
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}
