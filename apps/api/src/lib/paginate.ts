import type { PageQuery } from "@six/shared";

/** Prisma args for newest-first cursor pagination keyed on `id`; pair with `toPage`. */
export function pageArgs(q: PageQuery) {
  return {
    take: q.limit + 1,
    ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  };
}

export function toPage<T extends { id: string }, R>(rows: T[], q: PageQuery, map: (row: T) => R) {
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items: items.map(map), nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
