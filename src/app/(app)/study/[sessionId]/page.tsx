import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SwipeSession from "@/components/SwipeSession";
import { computeScore } from "@/lib/study/score";
import { pruneQueue } from "@/lib/study/pruneQueue";
import type { QueueEntry, SessionScope } from "@/lib/supabase/database.types";
import { getCurrentUser } from "@/lib/supabase/auth";

export default async function StudySessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) notFound();

  const { data: session } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) notFound();

  let queue = session.queue as QueueEntry[];
  let currentIndex = session.current_index;
  const cardIds = Array.from(
    new Set(queue.flatMap((e) => (e.type === "card" ? [e.cardId] : e.cardIds)))
  );
  const groupIds = Array.from(new Set(queue.filter((e) => e.type === "group").map((e) => e.groupId)));

  const [{ data: cards, error: cardsError }, { data: groups }, { data: profile }] = await Promise.all([
    cardIds.length > 0
      ? supabase.from("cards").select("*").in("id", cardIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? supabase.from("groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("answer_display_mode").eq("id", user.id).single(),
  ]);

  const cardsById = Object.fromEntries((cards ?? []).map((c) => [c.id, c]));

  // Cards deleted while the session was paused are skipped. The pruned queue
  // is saved too, since record_swipe checks grades against the stored queue.
  if (session.status !== "completed" && !cardsError) {
    const pruned = pruneQueue(queue, (id) => id in cardsById);
    if (pruned.changed) {
      queue = pruned.queue;
      currentIndex = pruned.currentIndex;
      await supabase
        .from("study_sessions")
        .update({
          queue,
          current_index: currentIndex,
          ...(currentIndex >= queue.length ? { status: "completed" as const } : {}),
        })
        .eq("id", sessionId);
    }
  }

  const groupNamesById = Object.fromEntries((groups ?? []).map((g) => [g.id, g.name]));
  const initialScore = session.status === "completed" ? computeScore(queue) : null;

  return (
    <SwipeSession
      sessionId={sessionId}
      initialQueue={queue}
      initialIndex={currentIndex}
      cardsById={cardsById}
      groupNamesById={groupNamesById}
      answerMode={profile?.answer_display_mode ?? "both"}
      studyMode={(session.scope as SessionScope).studyMode ?? "quiz"}
      initialScore={initialScore}
    />
  );
}
