"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildQueue, shuffleQueue } from "@/lib/study/buildQueue";
import type {
  QueueEntry,
  RecordSwipeResult,
  SessionResultDetail,
  SessionScope,
  StudyMode,
} from "@/lib/supabase/database.types";
import { getCurrentUser } from "@/lib/supabase/auth";

const MAX_ACTIVE_SESSIONS = 5;

/** Sends the user back to the study page if they're at the in-progress cap. */
async function ensureSessionSlot(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { count: activeCount } = await supabase
    .from("study_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "completed");

  if ((activeCount ?? 0) >= MAX_ACTIVE_SESSIONS) {
    redirect(
      `/study/new?error=${encodeURIComponent(
        `You already have ${MAX_ACTIVE_SESSIONS} sessions in progress. Finish or delete one first.`
      )}`
    );
  }
}

export async function createSession(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "");
  const requestedMode = String(formData.get("mode") ?? "all") as "all" | "random";
  const countRaw = String(formData.get("count") ?? "all");
  const groupIds = formData.getAll("group_ids").map(String).filter(Boolean);
  const name = String(formData.get("name") ?? "").trim();
  const shuffleOrder = formData.get("shuffle") === "on";
  const studyMode: StudyMode = formData.get("study_mode") === "flashcards" ? "flashcards" : "quiz";

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await ensureSessionSlot(supabase, user.id);

  const [{ data: cardRows, error: cardsError }, { data: set }] = await Promise.all([
    supabase.from("cards").select("id, card_groups(group_id)").eq("set_id", setId).order("created_at"),
    supabase.from("sets").select("name").eq("id", setId).maybeSingle(),
  ]);

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

  const queue = buildQueue(cards, {
    mode: effectiveMode,
    count,
    groupOrder: groupIds,
    shuffle: shuffleOrder,
    // Flashcards over the whole set: one deck of individual cards, so a missed
    // card can go back anywhere. Selected groups stay bundled -- each group is
    // its own deck, and a missed card is shuffled back within it.
    bundleGroups: !(studyMode === "flashcards" && groupIds.length === 0),
  });

  const scope: SessionScope = {
    setId,
    groupIds: groupIds.length > 0 ? groupIds : undefined,
    mode: effectiveMode,
    count,
    shuffle: shuffleOrder,
    studyMode,
  };

  const { data: session, error: sessionError } = await supabase
    .from("study_sessions")
    .insert({
      user_id: user.id,
      // Unnamed sessions are named after their set, so the list and history
      // always say what's being studied.
      name: name || (set ? `${set.name} session` : null),
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
 * Starts a fresh session over exactly the same cards as `sessionId` -- the
 * same random sample, the same groups -- so a user can drill one batch until
 * they're happy with it. It's a new session rather than a reset of the old
 * one, so every attempt keeps its own score in history.
 */
export async function restartSession(sessionId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: previous } = await supabase
    .from("study_sessions")
    .select("name, scope, queue")
    .eq("id", sessionId)
    .single();
  if (!previous) redirect("/study/new");

  await startRepeatSession(supabase, user.id, {
    name: previous.name,
    scope: previous.scope as SessionScope,
    queue: previous.queue as QueueEntry[],
  });
}

/**
 * "Study these again" from a history result. Reuses the original session's
 * queue when it still exists (keeping its groups); otherwise rebuilds one from
 * the cards recorded on the result itself.
 */
export async function restartFromResult(resultId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: result } = await supabase
    .from("session_results")
    .select("session_id, set_id, set_name, details, study_mode")
    .eq("id", resultId)
    .eq("user_id", user.id)
    .single();
  if (!result) redirect("/history");

  const { data: previous } = result.session_id
    ? await supabase
        .from("study_sessions")
        .select("name, scope, queue")
        .eq("id", result.session_id)
        .maybeSingle()
    : { data: null };

  if (previous) {
    await startRepeatSession(supabase, user.id, {
      name: previous.name,
      scope: previous.scope as SessionScope,
      queue: previous.queue as QueueEntry[],
    });
  }

  // record_swipe reads the set id off the scope when the session finishes, so
  // a result whose set was deleted (taking its cards with it) can't restart.
  if (!result.set_id) {
    redirect(`/study/new?error=${encodeURIComponent("The set from that session no longer exists")}`);
  }

  const cardIds = Array.from(
    new Set((result.details as SessionResultDetail[]).map((detail) => detail.card_id))
  );
  await startRepeatSession(supabase, user.id, {
    name: result.set_name ? `${result.set_name} session` : null,
    scope: {
      setId: result.set_id,
      mode: "random",
      count: cardIds.length,
      studyMode: result.study_mode,
    },
    queue: cardIds.map((cardId) => ({ type: "card", cardId, status: "pending" })),
  });
}

/**
 * Inserts a new session over the cards of `source.queue` with every grade
 * reset, then redirects into it. Cards deleted since are dropped, and a
 * shuffled session is reshuffled so the user drills the cards, not the sequence.
 */
async function startRepeatSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  source: { name: string | null; scope: SessionScope; queue: QueueEntry[] }
): Promise<never> {
  await ensureSessionSlot(supabase, userId);

  const referenced = source.queue.flatMap((e) => (e.type === "card" ? [e.cardId] : e.cardIds));
  const { data: existing } =
    referenced.length > 0
      ? await supabase.from("cards").select("id").in("id", referenced)
      : { data: [] };
  const alive = new Set((existing ?? []).map((card) => card.id));

  let queue = source.queue.flatMap((entry): QueueEntry[] => {
    if (entry.type === "card") {
      return alive.has(entry.cardId) ? [{ type: "card", cardId: entry.cardId, status: "pending" }] : [];
    }
    const cardIds = entry.cardIds.filter((id) => alive.has(id));
    if (cardIds.length === 0) return [];
    return [
      {
        type: "group",
        groupId: entry.groupId,
        cardIds,
        statuses: Object.fromEntries(cardIds.map((id) => [id, "pending" as const])),
      },
    ];
  });
  if (source.scope.shuffle ?? source.scope.mode === "random") queue = shuffleQueue(queue);

  if (queue.length === 0) {
    redirect(`/study/new?error=${encodeURIComponent("The cards from that session no longer exist")}`);
  }

  const { data: session, error } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      name: source.name,
      status: "active",
      scope: source.scope,
      queue,
      current_index: 0,
    })
    .select("id")
    .single();

  if (error || !session) {
    redirect(`/study/new?error=${encodeURIComponent(error?.message ?? "Could not restart session")}`);
  }

  revalidatePath("/study/new");
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
  result: "correct" | "incorrect",
  requeuePosition?: number,
  activeSeconds?: number
): Promise<RecordSwipeResult> {
  const supabase = await createClient();

  // Saved before the grade so that, on the last card, the result row's
  // duration (filled in by a trigger from this column) includes it.
  if (activeSeconds !== undefined) await saveActiveSeconds(supabase, sessionId, activeSeconds);

  const { data, error } = await supabase.rpc("record_swipe", {
    p_session_id: sessionId,
    p_card_id: cardId,
    p_result: result,
    p_requeue_position: requeuePosition,
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

/**
 * The session's queue as the server has it. Used to resync the study screen
 * after a save fails, when the client can't tell whether the grade landed.
 */
export async function getSessionState(
  sessionId: string
): Promise<{ queue: QueueEntry[]; currentIndex: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_sessions")
    .select("queue, current_index")
    .eq("id", sessionId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Session not found");
  return { queue: data.queue as QueueEntry[], currentIndex: data.current_index };
}

/**
 * Stores the study screen's running timer. Only ever moves forward, so a
 * late or out-of-order save can't wind the clock back. Best effort: a failure
 * (or a database without migration 0006) never gets in the way of studying.
 */
async function saveActiveSeconds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  seconds: number
) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  try {
    await supabase
      .from("study_sessions")
      .update({ active_seconds: Math.floor(seconds) })
      .eq("id", sessionId)
      .lt("active_seconds", Math.floor(seconds));
  } catch {
    // Ignored -- see above.
  }
}

export async function saveActiveTime(sessionId: string, seconds: number) {
  const supabase = await createClient();
  await saveActiveSeconds(supabase, sessionId, seconds);
}

export async function pauseSession(sessionId: string, formData?: FormData) {
  const supabase = await createClient();
  await saveActiveSeconds(supabase, sessionId, Number(formData?.get("active_seconds") ?? 0));
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
