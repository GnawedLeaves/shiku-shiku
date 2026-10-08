import { createClient } from "@/lib/supabase/server";
import type { RewardSummary } from "@/lib/supabase/database.types";

/**
 * The signed-in user's points, medals and next medal (rewards skeleton,
 * migration 0011). Null if the rewards tables aren't there yet, so callers can
 * simply hide the section.
 *
 * How it fits together:
 *  - Points are rows in `reward_ledger` (append-only, signed, one row per
 *    source + reason so nothing is paid twice).
 *  - Battles pay out automatically: a trigger awards `reward_rules` points by
 *    placement when a room finishes. New sources (study streaks, quizzes…)
 *    just insert ledger rows with their own `source`/`reason`.
 *  - Medals are thresholds in `medal_definitions`. Spending or converting
 *    points later is a negative ledger row.
 */
export async function getRewardSummary(): Promise<RewardSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_reward_summary");
  if (error || !data) return null;
  return data;
}

/** Progress (0-1) from the previous medal (or zero) toward the next one. */
export function progressToNextMedal(summary: RewardSummary, previousThreshold = 0): number {
  if (!summary.next_medal) return 1;
  const span = summary.next_medal.threshold - previousThreshold;
  return span > 0 ? Math.min(1, Math.max(0, (summary.points - previousThreshold) / span)) : 1;
}
