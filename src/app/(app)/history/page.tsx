import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 1) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function scoreBadge(percentage: number): string {
  if (percentage >= 80) return "badge-success";
  if (percentage >= 50) return "badge-warning";
  return "badge-error";
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: results } = await supabase
    .from("session_results")
    .select(
      "id, session_id, set_id, set_name, score_percentage, correct_count, total_count, duration_seconds, completed_at, study_mode, dont_know_count"
    )
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .limit(100);

  const sessions = results ?? [];

  // Session names live on study_sessions; look them up in one query.
  const sessionIds = Array.from(
    new Set(sessions.map((s) => s.session_id).filter((id): id is string => Boolean(id)))
  );
  const { data: sessionRows } =
    sessionIds.length > 0
      ? await supabase.from("study_sessions").select("id, name").in("id", sessionIds)
      : { data: [] };
  const sessionNames = new Map((sessionRows ?? []).map((row) => [row.id, row.name]));
  const totalCards = sessions.reduce((sum, s) => sum + s.total_count, 0);
  // Flashcards sessions aren't scored, so the overall percentage is quiz-only.
  const quizzes = sessions.filter((s) => s.study_mode === "quiz");
  const quizCards = quizzes.reduce((sum, s) => sum + s.total_count, 0);
  const quizCorrect = quizzes.reduce((sum, s) => sum + s.correct_count, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Study history</h1>

      {sessions.length === 0 ? (
        <div className="alert">
          <span>No finished sessions yet. Complete a study session and it will show up here.</span>
        </div>
      ) : (
        <>
          <div className="stats stats-horizontal bg-base-100 w-full">
            <div className="stat p-3">
              <div className="stat-title text-xs">Sessions</div>
              <div className="stat-value text-2xl">{sessions.length}</div>
            </div>
            <div className="stat p-3">
              <div className="stat-title text-xs">Cards answered</div>
              <div className="stat-value text-2xl">{totalCards}</div>
            </div>
            <div className="stat p-3">
              <div className="stat-title text-xs">Quiz overall</div>
              <div className="stat-value text-2xl">
                {quizCards > 0 ? `${Math.round((quizCorrect / quizCards) * 100)}%` : "—"}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {sessions.map((session) => {
              const setName = session.set_name ?? "Deleted set";
              const sessionName = session.session_id ? sessionNames.get(session.session_id) : null;
              return (
                <Link
                  key={session.id}
                  href={`/history/${session.id}`}
                  className="card bg-base-100 hover:bg-base-200 transition-colors"
                >
                  <div className="card-body p-4 gap-1">
                    <div className="flex items-start justify-between gap-3">
                      {/* Unnamed sessions fall back to the set name, shown once. */}
                      <span className="text-body-sm truncate min-w-0">
                        {sessionName || setName}
                      </span>
                      {sessionName && (
                        <span className="text-xs opacity-50 truncate max-w-[45%] shrink-0">
                          {setName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-x-3 text-xs opacity-60">
                        {session.study_mode === "flashcards" ? (
                          <span>
                            {session.total_count} card{session.total_count === 1 ? "" : "s"} ·{" "}
                            {session.dont_know_count} don&apos;t know
                          </span>
                        ) : (
                          <span>
                            {session.correct_count}/{session.total_count} correct
                          </span>
                        )}
                        <span>{formatDuration(session.duration_seconds)}</span>
                        <span>
                          {new Date(session.completed_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      {session.study_mode === "flashcards" ? (
                        <span className="badge badge-sm badge-outline shrink-0">Flashcards</span>
                      ) : (
                        <span
                          className={`badge badge-sm shrink-0 ${scoreBadge(session.score_percentage)}`}
                        >
                          {Math.round(session.score_percentage)}%
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
