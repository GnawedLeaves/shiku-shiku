"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildQueue } from "@/lib/study/buildQueue";
import { computeScore } from "@/lib/study/score";
import type { QueueEntry, SessionScope } from "@/lib/supabase/database.types";

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

  let cardsQuery = supabase.from("cards").select("id, group_id").eq("set_id", setId);
  if (groupIds.length > 0) {
    cardsQuery = cardsQuery.in("group_id", groupIds);
  }
  const { data: cards, error: cardsError } = await cardsQuery;

  if (cardsError || !cards || cards.length === 0) {
    redirect(`/study/new?error=${encodeURIComponent("No cards found for that selection")}`);
  }

  // Explicit group selection always bundles by group; otherwise honor the
  // chosen mode (random sampling never bundles).
  const effectiveMode: "all" | "random" = groupIds.length > 0 ? "all" : requestedMode;
  const count: number | "all" = countRaw === "all" ? "all" : Math.max(1, Number(countRaw) || 1);

  const queue = buildQueue(cards, { mode: effectiveMode, count });

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

export async function recordSwipe(
  sessionId: string,
  cardId: string,
  result: "correct" | "incorrect"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !session) throw new Error("Session not found");

  const queue = session.queue as QueueEntry[];
  let currentIndex = session.current_index;
  const currentEntry = queue[currentIndex];
  if (!currentEntry) throw new Error("This session is already complete");

  if (currentEntry.type === "card") {
    if (currentEntry.cardId !== cardId) throw new Error("Card does not match the current queue entry");
    currentEntry.status = result;
  } else {
    if (!(cardId in currentEntry.statuses)) throw new Error("Card does not belong to the current group");
    currentEntry.statuses[cardId] = result;
  }

  const { data: progress } = await supabase
    .from("card_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("card_id", cardId)
    .maybeSingle();

  await supabase.from("card_progress").upsert({
    user_id: user.id,
    card_id: cardId,
    times_correct: (progress?.times_correct ?? 0) + (result === "correct" ? 1 : 0),
    times_incorrect: (progress?.times_incorrect ?? 0) + (result === "incorrect" ? 1 : 0),
    last_reviewed_at: new Date().toISOString(),
  });

  const entryResolved =
    currentEntry.type === "card"
      ? currentEntry.status !== "pending"
      : Object.values(currentEntry.statuses).every((s) => s !== "pending");

  if (entryResolved) currentIndex += 1;

  const isComplete = currentIndex >= queue.length;

  if (isComplete) {
    const { correct, total } = computeScore(queue);
    const scorePercentage = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;

    await supabase
      .from("study_sessions")
      .update({ queue, current_index: currentIndex, status: "completed" })
      .eq("id", sessionId);

    await supabase.from("session_results").insert({
      session_id: sessionId,
      user_id: user.id,
      set_id: (session.scope as SessionScope).setId,
      score_percentage: scorePercentage,
    });
  } else {
    await supabase.from("study_sessions").update({ queue, current_index: currentIndex }).eq("id", sessionId);
  }

  revalidatePath(`/study/${sessionId}`);
  return { queue, currentIndex, isComplete };
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
