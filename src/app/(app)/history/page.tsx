import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: results } = await supabase
    .from("session_results")
    .select("id, set_id, set_name, score_percentage, correct_count, total_count, duration_seconds, completed_at")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .limit(100);

  const sessions = results ?? [];
  const totalCards = sessions.reduce((sum, s) => sum + s.total_count, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correct_count, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Study history</h1>

      {sessions.length === 0 ? (
        <div className="alert">
          <span>No finished sessions yet. Complete a study session and it will show up here.</span>
        </div>
      ) : (
        <>
          <div className="stats stats-horizontal shadow-sm bg-base-100 w-full">
            <div className="stat p-3">
              <div className="stat-title text-xs">Sessions</div>
              <div className="stat-value text-2xl">{sessions.length}</div>
            </div>
            <div className="stat p-3">
              <div className="stat-title text-xs">Cards answered</div>
              <div className="stat-value text-2xl">{totalCards}</div>
            </div>
            <div className="stat p-3">
              <div className="stat-title text-xs">Overall</div>
              <div className="stat-value text-2xl">
                {totalCards > 0 ? Math.round((totalCorrect / totalCards) * 100) : 0}%
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/history/${session.id}`}
                className="card bg-base-100 shadow-sm hover:bg-base-200 transition-colors"
              >
                <div className="card-body p-4 gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {session.set_name ?? "Deleted set"}
                    </span>
                    <span className={`badge ${scoreBadge(session.score_percentage)}`}>
                      {Math.round(session.score_percentage)}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs opacity-60">
                    <span>
                      {session.correct_count}/{session.total_count} correct
                    </span>
                    <span>{formatDuration(session.duration_seconds)}</span>
                    <span>
                      {new Date(session.completed_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
