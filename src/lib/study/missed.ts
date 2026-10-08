import type { QueueEntry, SessionResultDetail } from "@/lib/supabase/database.types";

/**
 * The cards a session found hard: any card "don't know" was pressed on in
 * flashcards mode (it needed more than one go), or any card marked wrong in
 * quiz mode.
 */
export function missedCardIdsFromQueue(queue: QueueEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of queue) {
    if (entry.type === "card") {
      if ((entry.misses ?? 0) > 0 || entry.status === "incorrect") ids.add(entry.cardId);
    } else {
      for (const cardId of entry.cardIds) {
        if ((entry.misses?.[cardId] ?? 0) > 0 || entry.statuses[cardId] === "incorrect") {
          ids.add(cardId);
        }
      }
    }
  }
  return ids;
}

/** The same, from a finished result's per-card details. */
export function missedCardIdsFromDetails(details: SessionResultDetail[]): Set<string> {
  return new Set(
    details
      .filter((detail) => (detail.misses ?? 0) > 0 || detail.result === "incorrect")
      .map((detail) => detail.card_id)
  );
}

/**
 * Keeps only `cardIds` from a queue, preserving its order and groups (a group
 * that loses every card is dropped).
 */
export function keepOnlyCards(queue: QueueEntry[], cardIds: Set<string>): QueueEntry[] {
  return queue.flatMap((entry): QueueEntry[] => {
    if (entry.type === "card") return cardIds.has(entry.cardId) ? [entry] : [];
    const kept = entry.cardIds.filter((id) => cardIds.has(id));
    return kept.length > 0 ? [{ ...entry, cardIds: kept }] : [];
  });
}

/** "Evening review" -> "Evening review — retry" (without stacking up retries). */
export function retryName(name: string | null): string | null {
  if (!name) return null;
  return name.endsWith(" — retry") ? name : `${name} — retry`;
}

/**
 * Known-first-time vs didn't-know as whole percentages that always add up to
 * 100 (rounding each side separately can give 99 or 101).
 */
export function knownSplit(known: number, total: number) {
  const knownPercent = total > 0 ? Math.round((known / total) * 100) : 0;
  return {
    known,
    missed: Math.max(0, total - known),
    knownPercent,
    missedPercent: total > 0 ? 100 - knownPercent : 0,
  };
}
