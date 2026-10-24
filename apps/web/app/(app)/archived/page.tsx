import { Archive } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";

export default function ArchivedIndex() {
  return <EmptyPane Icon={Archive}>Archived chats stay here until a new message arrives or you unarchive them.</EmptyPane>;
}
