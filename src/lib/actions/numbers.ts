"use server";

// Number listening practice (single player). Battles in numbers mode go
// through the battle actions instead.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { cleanNumberOptions, type NumberOptions } from "@/lib/numbers/japanese";

export async function saveNumberPractice(
  options: NumberOptions,
  result: {
    correct: number;
    skips: number;
    hintsUsed: number;
    wrongAttempts: number;
    skippedNumbers: number[];
    durationSeconds: number;
  }
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const { min, max, rounds } = cleanNumberOptions(options);
  const whole = (n: number) => Math.max(0, Math.floor(Number(n) || 0));
  const supabase = await createClient();
  const { error } = await supabase.from("number_practice_results").insert({
    user_id: user.id,
    number_min: min,
    number_max: max,
    rounds,
    correct_count: Math.min(whole(result.correct), rounds),
    skip_count: whole(result.skips),
    hints_used: whole(result.hintsUsed),
    wrong_attempts: whole(result.wrongAttempts),
    skipped_numbers: result.skippedNumbers.slice(0, 500).map(whole),
    duration_seconds: whole(result.durationSeconds),
  });

  revalidatePath("/history");
  return error ? { error: error.message } : { ok: true as const };
}
