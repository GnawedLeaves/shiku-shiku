"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildQueue } from "@/lib/study/buildQueue";
import type { RecordSwipeResult, SessionScope } from "@/lib/supabase/database.types";

const MAX_ACTIVE_SESSIONS = 5;

export async function createSession(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "");
  const requestedMode = String(formData.get("mode") ?? "all") as "all" | "random";
  const countRaw = String(formData.get("count") ?? "all");
  const groupIds = formData.getAll("group_ids").map(String).filter(Boolean);
  const name = String(formData.get("name") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: activeCount } = await supabase
    .from("study_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("status", "completed");

  if ((activeCount ?? 0) >= MAX_ACTIVE_SESSIONS) {
    redirect(
      `/study/new?error=${encodeURIComponent(
        `You already have ${MAX_ACTIVE_SESSIONS} sessions in progress. Finish or delete one first.`
      )}`
    );
  }

  const { data: cardRows, error: cardsError } = await supabase
    .from("cards")
    .select("id, card_groups(group_id)")
    .eq("set_id", setId)
    .order("created_at");

  const allCards = (cardRows ?? []).map((row) => ({
    id: row.id,
    groupIds: (row.card_groups ?? []).map((link: { group_id: string }) => link.group_id),
  }));

  // Selected groups act as a filter: keep cards tagged with any of them.
  const cards =
    groupIds.length > 0
      ? allCards.filter((card) => card.groupIds.some((id) => groupIds.includes(id)))
      : allCards;

  if (cardsError || cards.length === 0) {
    redirect(`/study/new?error=${encodeURIComponent("No cards found for that selection")}`);
  }

  // Explicit group selection always bundles by group; otherwise honor the
  // chosen mode (random sampling never bundles).
  const effectiveMode: "all" | "random" = groupIds.length > 0 ? "all" : requestedMode;
  const count: number | "all" = countRaw === "all" ? "all" : Math.max(1, Number(countRaw) || 1);

  const queue = buildQueue(cards, { mode: effectiveMode, count, groupOrder: groupIds });

  const scope: SessionScope = {
    setId,
    groupIds: groupIds.length > 0 ? groupIds : undefined,
    mode: effectiveMode,
    count,
  };

  const { data: session, error: sessionError } = await supabase
    .from("study_sessions")
    .insert({
      user_id: user.id,
      name: name || null,
      status: "active",
      scope,
      queue,
      current_index: 0,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    redirect(`/study/new?error=${encodeURIComponent(sessionError?.message ?? "Could not start session")}`);
  }

  redirect(`/study/${session.id}`);
}

/**
 * Grades one card. The queue update, card_progress upsert, session write and
 * (on the last card) the result row all happen inside the `record_swipe`
 * database function, so a swipe costs one roundtrip instead of five. The page
 * is deliberately not revalidated here -- the client already holds the new
 * queue, and re-rendering the session route on every swipe is what made
 * advancing to the next card feel slow.
 */
export async function recordSwipe(
  sessionId: string,
  cardId: string,
  result: "correct" | "incorrect"
): Promise<RecordSwipeResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("record_swipe", {
    p_session_id: sessionId,
    p_card_id: cardId,
    p_result: result,
  });

  if (error) throw new Error(error.message);

  const outcome = data as RecordSwipeResult;
  if (outcome.isComplete) {
    // Only the finished state needs fresh server data (history + session list).
    revalidatePath("/study/new");
    revalidatePath("/history");
  }

  return outcome;
}

export async function pauseSession(sessionId: string) {
  const supabase = await createClient();
  await supabase.from("study_sessions").update({ status: "paused" }).eq("id", sessionId);
  revalidatePath("/study/new");
  redirect("/study/new");
}

export async function resumeSession(sessionId: string) {
  const supabase = await createClient();
  await supabase.from("study_sessions").update({ status: "active" }).eq("id", sessionId);
  redirect(`/study/${sessionId}`);
}

export async function deleteSession(sessionId: string) {
  const supabase = await createClient();
  await supabase.from("study_sessions").delete().eq("id", sessionId);
  revalidatePath("/study/new");
}
