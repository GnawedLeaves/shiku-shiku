import type { QueueEntry } from "@/lib/supabase/database.types";

export function computeScore(queue: QueueEntry[]) {
  const total = queue.reduce((sum, e) => sum + (e.type === "card" ? 1 : e.cardIds.length), 0);
  const correct = queue.reduce((sum, e) => {
    if (e.type === "card") return sum + (e.status === "correct" ? 1 : 0);
    return sum + Object.values(e.statuses).filter((s) => s === "correct").length;
  }, 0);
  return { correct, total };
}
