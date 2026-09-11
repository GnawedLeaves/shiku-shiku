import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SwipeSession from "@/components/SwipeSession";
import { computeScore } from "@/lib/study/score";
import type { QueueEntry } from "@/lib/supabase/database.types";

export default async function StudySessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: session } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) notFound();

  const queue = session.queue as QueueEntry[];
  const cardIds = Array.from(
    new Set(queue.flatMap((e) => (e.type === "card" ? [e.cardId] : e.cardIds)))
  );
  const groupIds = Array.from(new Set(queue.filter((e) => e.type === "group").map((e) => e.groupId)));

  const [{ data: cards }, { data: groups }, { data: profile }] = await Promise.all([
    cardIds.length > 0
      ? supabase.from("cards").select("*").in("id", cardIds)
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? supabase.from("groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("answer_display_mode").eq("id", user.id).single(),
  ]);

  const cardsById = Object.fromEntries((cards ?? []).map((c) => [c.id, c]));
  const groupNamesById = Object.fromEntries((groups ?? []).map((g) => [g.id, g.name]));
  const initialScore = session.status === "completed" ? computeScore(queue) : null;

  return (
    <SwipeSession
      sessionId={sessionId}
      initialQueue={queue}
      initialIndex={session.current_index}
      cardsById={cardsById}
      groupNamesById={groupNamesById}
      answerMode={profile?.answer_display_mode ?? "both"}
      initialScore={initialScore}
    />
  );
}
