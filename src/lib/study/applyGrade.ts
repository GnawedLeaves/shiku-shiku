import type { QueueEntry } from "@/lib/supabase/database.types";

export type Result = "correct" | "incorrect";

export interface SessionState {
  queue: QueueEntry[];
  currentIndex: number;
}

/**
 * How many places a missed card can be sent back by in flashcards mode: the
 * entries after the current one, or the group's other pending cards. 0 means
 * it's the last card left and comes straight back.
 */
export function requeueSlots(state: SessionState, cardId: string): number {
  const entry = state.queue[state.currentIndex];
  if (!entry) return 0;
  if (entry.type === "card") return state.queue.length - state.currentIndex - 1;
  return entry.cardIds.filter((id) => id !== cardId && entry.statuses[id] === "pending").length;
}

/** A random spot later in the deck, uniformly from 1 to `requeueSlots`. */
export function pickRequeuePosition(state: SessionState, cardId: string): number | undefined {
  const slots = requeueSlots(state, cardId);
  return slots > 0 ? 1 + Math.floor(Math.random() * slots) : undefined;
}

function clamp(position: number | undefined, slots: number): number {
  return Math.min(Math.max(position ?? slots, 1), slots);
}

/**
 * Applies a grade locally, exactly as `record_swipe` does on the server
 * (supabase/migrations/0005_flashcards_mode.sql) -- keep the two in step.
 *
 * In flashcards mode "incorrect" doesn't fail the card: it stays pending, its
 * miss count goes up, and it moves `requeuePosition` places further back.
 */
export function applyGrade(
  state: SessionState,
  cardId: string,
  result: Result,
  options: { flashcards: boolean; requeuePosition?: number }
): SessionState {
  const entry = state.queue[state.currentIndex];
  if (!entry) return state;

  const requeue = options.flashcards && result === "incorrect";
  const slots = requeueSlots(state, cardId);
  const queue = [...state.queue];
  let resolved: boolean;

  if (entry.type === "card") {
    if (entry.cardId !== cardId) return state;

    if (requeue) {
      const updated = { ...entry, misses: (entry.misses ?? 0) + 1 };
      queue.splice(state.currentIndex, 1);
      queue.splice(
        slots > 0 ? state.currentIndex + clamp(options.requeuePosition, slots) : state.currentIndex,
        0,
        updated
      );
      resolved = false;
    } else {
      queue[state.currentIndex] = { ...entry, status: result };
      resolved = true;
    }
  } else {
    if (!(cardId in entry.statuses)) return state;

    let updated = entry;
    if (requeue) {
      updated = { ...entry, misses: { ...entry.misses, [cardId]: (entry.misses?.[cardId] ?? 0) + 1 } };
      if (slots > 0) {
        const done = entry.cardIds.filter((id) => entry.statuses[id] !== "pending");
        const others = entry.cardIds.filter(
          (id) => id !== cardId && entry.statuses[id] === "pending"
        );
        const offset = clamp(options.requeuePosition, slots);
        updated.cardIds = [...done, ...others.slice(0, offset), cardId, ...others.slice(offset)];
      }
    } else {
      updated = { ...entry, statuses: { ...entry.statuses, [cardId]: result } };
    }

    queue[state.currentIndex] = updated;
    resolved = Object.values(updated.statuses).every((status) => status !== "pending");
  }

  return { queue, currentIndex: resolved ? state.currentIndex + 1 : state.currentIndex };
}

/** Total "don't know" presses across a flashcards session so far. */
export function countMisses(queue: QueueEntry[]): number {
  return queue.reduce(
    (sum, entry) =>
      sum +
      (entry.type === "card"
        ? (entry.misses ?? 0)
        : Object.values(entry.misses ?? {}).reduce((a, b) => a + b, 0)),
    0
  );
}

/** Misses for one card, used to give a repeated card a fresh deck animation. */
export function cardMisses(entry: QueueEntry, cardId: string): number {
  return entry.type === "card" ? (entry.misses ?? 0) : (entry.misses?.[cardId] ?? 0);
}
