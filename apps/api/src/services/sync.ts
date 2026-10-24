import type { SyncQuery, SyncResult } from "@six/shared";
import { toChangeEventDTO } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";

export async function sync(userId: string, q: SyncQuery): Promise<SyncResult> {
  if (q.since === undefined) {
    const head = await prisma.changeEvent.findFirst({
      where: { userId },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    return { events: [], cursor: (head?.id ?? 0n).toString(), hasMore: false };
  }

  const rows = await prisma.changeEvent.findMany({
    where: { userId, id: { gt: BigInt(q.since) } },
    orderBy: { id: "asc" },
    take: q.limit + 1,
  });
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  return {
    events: page.map(toChangeEventDTO),
    cursor: last ? last.id.toString() : q.since,
    hasMore,
  };
}
