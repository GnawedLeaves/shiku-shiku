import type { QueueEntry } from "@/lib/supabase/database.types";

/**
 * Drops cards that no longer exist (deleted while the session was paused)
 * from a queue. Groups lose just the missing cards, and disappear once empty.
 *
 * `currentIndex` is recomputed as the first entry with a card still pending --
 * the same position `record_swipe` maintains, since everything before it is
 * resolved -- so if the card the user was on is gone, they move to the next.
 * Returns `changed: false` when nothing was removed, so callers can skip the
 * write.
 */
export function pruneQueue(
  queue: QueueEntry[],
  exists: (cardId: string) => boolean
): { queue: QueueEntry[]; currentIndex: number; changed: boolean } {
  let changed = false;

  const pruned = queue.flatMap((entry): QueueEntry[] => {
    if (entry.type === "card") {
      if (exists(entry.cardId)) return [entry];
      changed = true;
      return [];
    }

    const cardIds = entry.cardIds.filter(exists);
    if (cardIds.length === entry.cardIds.length) return [entry];
    changed = true;
    if (cardIds.length === 0) return [];

    const keep = <T,>(record: Record<string, T> | undefined) =>
      record && Object.fromEntries(Object.entries(record).filter(([id]) => exists(id)));
    return [
      {
        ...entry,
        cardIds,
        statuses: keep(entry.statuses)!,
        ...(entry.misses ? { misses: keep(entry.misses) } : {}),
      },
    ];
  });

  const firstPending = pruned.findIndex((entry) =>
    entry.type === "card"
      ? entry.status === "pending"
      : Object.values(entry.statuses).some((status) => status === "pending")
  );

  return {
    queue: pruned,
    currentIndex: firstPending === -1 ? pruned.length : firstPending,
    changed,
  };
}
