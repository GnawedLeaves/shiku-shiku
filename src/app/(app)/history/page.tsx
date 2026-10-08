import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { ordinal } from "@/lib/battle/players";

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

type Tab = "study" | "battles";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "battles" ? "battles" : "study";
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">History</h1>

      {/* Tabs live in the URL so back/forward and reloads keep the tab. */}
      <nav className="flex gap-2" aria-label="History type">
        {(
          [
            ["study", "Study"],
            ["battles", "Battles"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={value === "study" ? "/history" : "/history?tab=battles"}
            aria-current={tab === value ? "page" : undefined}
            className={`btn btn-sm ${tab === value ? "btn-primary" : "btn-outline"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "study" ? <StudyHistory userId={user.id} /> : <BattleHistory userId={user.id} />}
    </div>
  );
}

async function StudyHistory({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: results } = await supabase
    .from("session_results")
    .select(
      "id, session_id, set_id, set_name, score_percentage, correct_count, total_count, duration_seconds, completed_at, study_mode, dont_know_count"
    )
    .eq("user_id", userId)
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

interface BattleRow {
  roomId: string;
  won: boolean;
  /** 1 = first to clear the deck; null if you gave up. */
  placement: number | null;
  gaveUp: boolean;
  playerCount: number;
  opponentsLabel: string;
  setName: string;
  total: number;
  cleared: number;
  dontKnow: number;
  firstTry: number;
  seconds: number | null;
  finishedAt: string;
}

/** Finished battles, newest first, each linking to its results screen. */
async function BattleHistory({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: mine, error } = await supabase
    .from("battle_room_members")
    .select(
      "room_id, cleared, dont_know, first_try, finished_at, placement, forfeited_at, battle_rooms!inner(status, winner_id, set_name, card_count, started_at, finished_at)"
    )
    .eq("user_id", userId)
    .eq("battle_rooms.status", "finished");

  if (error) {
    return (
      <div className="alert alert-error text-sm py-2">
        <span>Couldn&apos;t load battles. Have migrations 0008 and 0011 been run?</span>
      </div>
    );
  }

  const roomIds = (mine ?? []).map((row) => row.room_id);
  const { data: others } = roomIds.length
    ? await supabase
        .from("battle_room_members")
        .select("room_id, user_id")
        .in("room_id", roomIds)
        .neq("user_id", userId)
    : { data: [] };
  const opponentIds = Array.from(new Set((others ?? []).map((o) => o.user_id)));
  const { data: profiles } = opponentIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", opponentIds)
    : { data: [] };

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? "Player"]));
  const opponentsByRoom = new Map<string, string[]>();
  for (const o of others ?? []) {
    opponentsByRoom.set(o.room_id, [...(opponentsByRoom.get(o.room_id) ?? []), o.user_id]);
  }
  const seconds = (from: string | null, to: string | null) =>
    from && to ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000)) : null;

  const battles: BattleRow[] = (mine ?? [])
    .map((row) => {
      const room = row.battle_rooms;
      const opponentNames = (opponentsByRoom.get(row.room_id) ?? []).map(
        (id) => nameById.get(id) ?? "Player"
      );
      return {
        roomId: row.room_id,
        won: room.winner_id === userId,
        placement: row.placement,
        gaveUp: Boolean(row.forfeited_at),
        playerCount: opponentNames.length + 1,
        opponentsLabel:
          opponentNames.length <= 2
            ? opponentNames.join(" & ") || "Player"
            : `${opponentNames[0]} + ${opponentNames.length - 1} others`,
        setName: room.set_name ?? "Unknown set",
        total: room.card_count ?? 0,
        cleared: row.cleared,
        dontKnow: row.dont_know,
        firstTry: row.first_try,
        seconds: seconds(room.started_at, row.finished_at ?? room.finished_at),
        finishedAt: room.finished_at ?? room.started_at ?? "",
      };
    })
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));

  if (battles.length === 0) {
    return (
      <div className="alert">
        <span>No finished battles yet. Challenge a friend from the Friends tab or a set.</span>
      </div>
    );
  }

  const wins = battles.filter((b) => b.won).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="stats stats-horizontal bg-base-100 w-full">
        <div className="stat p-3">
          <div className="stat-title text-xs">Battles</div>
          <div className="stat-value text-2xl">{battles.length}</div>
        </div>
        <div className="stat p-3">
          <div className="stat-title text-xs">Wins</div>
          <div className="stat-value text-2xl">{wins}</div>
        </div>
        <div className="stat p-3">
          <div className="stat-title text-xs">Win rate</div>
          <div className="stat-value text-2xl">{Math.round((wins / battles.length) * 100)}%</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {battles.map((battle) => (
          <Link
            key={battle.roomId}
            href={`/battle/${battle.roomId}`}
            className="card bg-base-100 hover:bg-base-200 transition-colors"
          >
            <div className="card-body p-4 gap-1">
              <div className="flex items-start justify-between gap-3">
                <span className="text-body-sm truncate min-w-0">vs {battle.opponentsLabel}</span>
                <span className="text-xs opacity-50 truncate max-w-[45%] shrink-0">
                  {battle.setName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-x-3 text-xs opacity-60">
                  <span>
                    {battle.cleared}/{battle.total} cleared · {battle.dontKnow} don&apos;t know
                  </span>
                  <span>{formatDuration(battle.seconds)}</span>
                  <span>
                    {new Date(battle.finishedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <span
                  className={`badge badge-sm shrink-0 ${battle.won ? "bg-iron text-concrete" : "badge-outline"}`}
                >
                  {battle.gaveUp
                    ? "Gave up"
                    : battle.placement
                      ? `${ordinal(battle.placement)} of ${battle.playerCount}`
                      : battle.won
                        ? "Won"
                        : "Lost"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
