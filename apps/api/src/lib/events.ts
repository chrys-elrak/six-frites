import type { ChangeEvent, Prisma } from "@prisma/client";
import type { ChangeEventData, ChangeEventDTO, ChangeEventType } from "@six/shared";
import { prisma } from "./prisma.js";
import { getIo, rooms } from "./realtime.js";

export type Tx = Prisma.TransactionClient;
export type Emit = <T extends ChangeEventType>(userId: string, type: T, data: ChangeEventData<T>) => void;

interface PendingEvent {
  userId: string;
  type: ChangeEventType;
  data: unknown;
}

export function toChangeEventDTO(row: ChangeEvent): ChangeEventDTO {
  return {
    eventId: row.id.toString(),
    type: row.type,
    data: row.payload,
    createdAt: row.createdAt.toISOString(),
  } as ChangeEventDTO;
}

/**
 * Runs `fn` in a transaction and stores every event it emits as ChangeEvent rows, then pushes them
 * over the socket once the transaction has committed.
 *
 * Event ids come from a sequence, so two concurrent transactions could commit out of id order and a
 * client syncing in between would skip the lower id forever. Taking a per-recipient advisory lock
 * before inserting serialises event writes per user, which keeps each user's stream gap-free.
 */
export async function withEvents<R>(fn: (tx: Tx, emit: Emit) => Promise<R>): Promise<R> {
  const pending: PendingEvent[] = [];
  const emit: Emit = (userId, type, data) => void pending.push({ userId, type, data });

  const { result, rows } = await prisma.$transaction(async (tx) => {
    const result = await fn(tx, emit);
    if (!pending.length) return { result, rows: [] as ChangeEvent[] };

    const recipients = [...new Set(pending.map((e) => e.userId))].sort();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(id)) FROM unnest(${recipients}::text[]) AS id ORDER BY id`;
    const rows = await tx.changeEvent.createManyAndReturn({
      data: pending.map((e) => ({ userId: e.userId, type: e.type, payload: e.data as Prisma.InputJsonValue })),
    });
    return { result, rows };
  });

  const io = getIo();
  if (io) for (const row of rows) io.to(rooms.user(row.userId)).emit("change", toChangeEventDTO(row));
  return result;
}
