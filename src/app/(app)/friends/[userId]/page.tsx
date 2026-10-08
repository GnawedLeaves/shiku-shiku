import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createBattleRoom } from "@/lib/actions/battle";
import { paintColorFor, readableTextColor } from "@/lib/study/groupColors";
import Avatar from "@/components/Avatar";
import OnlineDot from "@/components/realtime/OnlineDot";
import BackButton from "@/components/ui/BackButton";
import SubmitButton from "@/components/ui/SubmitButton";

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 1) return "—";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * A friend's profile: who they are, their sets (minus private ones) and their
 * recent study history. Only accepted friends can see it -- the set and
 * history lists come from functions that check the friendship server-side.
 */
export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (userId === user.id) redirect("/profile");

  const supabase = await createClient();
  const [{ data: friendship }, { data: profile }, { data: sets }, { data: history }] =
    await Promise.all([
      supabase
        .from("friendships")
        .select("updated_at")
        .eq("status", "accepted")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${userId}),` +
            `and(requester_id.eq.${userId},addressee_id.eq.${user.id})`
        )
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name, username, avatar_url, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.rpc("friend_profile_sets", { p_user: userId }),
      supabase.rpc("friend_profile_history", { p_user: userId, p_limit: 30 }),
    ]);

  if (!friendship || !profile) notFound();

  const name = profile.display_name ?? "Unnamed";
  const results = history ?? [];
  const totalSeconds = results.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <BackButton href="/friends" label="Friends" />

      <div className="flex items-center gap-4">
        <Avatar url={profile.avatar_url} name={name} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-center gap-3 break-words">
            <span className="min-w-0">{name}</span>
            <OnlineDot userId={userId} className="h-3.5 w-3.5" />
          </h1>
          {profile.username && <p className="text-body-sm opacity-70">@{profile.username}</p>}
          <p className="text-xs opacity-60">
            Friends since{" "}
            {new Date(friendship.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
          </p>
        </div>
      </div>

      <form action={createBattleRoom} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="invite" value={userId} />
        <span className="text-body-sm">Feeling competitive?</span>
        <SubmitButton className="btn btn-primary btn-sm" pendingText="Creating room…">
          Challenge to a battle
        </SubmitButton>
      </form>

      <div className="stats stats-horizontal w-full">
        <div className="stat p-3">
          <div className="stat-title text-xs">Sets</div>
          <div className="stat-value text-2xl">{sets?.length ?? 0}</div>
        </div>
        <div className="stat p-3">
          <div className="stat-title text-xs">Sessions</div>
          <div className="stat-value text-2xl">{results.length}</div>
        </div>
        <div className="stat p-3">
          <div className="stat-title text-xs">Time studied</div>
          <div className="stat-value text-2xl">{formatDuration(totalSeconds)}</div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-subheading">Sets</h2>
        {(sets ?? []).length === 0 ? (
          <p className="text-sm opacity-60">No sets to show.</p>
        ) : (
          <div className="grid grid-cols-1 border-t border-l border-iron sm:grid-cols-2">
            {(sets ?? []).map((set) => {
              const paint = set.color ?? paintColorFor(set.id);
              const ink = readableTextColor(paint);
              return (
                <div
                  key={set.id}
                  className="flex min-h-32 flex-col justify-between gap-4 border-b border-r border-iron p-4"
                  style={{ backgroundColor: paint, color: ink }}
                >
                  <h3 className="text-subheading break-words">{set.name}</h3>
                  <div className="flex flex-col gap-1">
                    {set.description && <p className="text-body line-clamp-2">{set.description}</p>}
                    <p className="text-body">
                      {set.card_count} {set.card_count === 1 ? "card" : "cards"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-subheading">Recent study</h2>
        {results.length === 0 ? (
          <p className="text-sm opacity-60">No finished sessions yet.</p>
        ) : (
          <div className="flex flex-col">
            {results.map((result) => {
              const title = result.session_name || result.set_name || "Study session";
              const flashcards = result.study_mode === "flashcards";
              return (
                <div key={result.id} className="flex flex-col gap-1 border-b border-iron py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-body-sm min-w-0 truncate">{title}</span>
                    {result.session_name && result.set_name && (
                      <span className="max-w-[45%] shrink-0 truncate text-xs opacity-50">
                        {result.set_name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs opacity-60">
                    <span>
                      {flashcards
                        ? `${result.total_count} cards · ${result.dont_know_count} don't know`
                        : `${result.correct_count}/${result.total_count} correct · ${Math.round(result.score_percentage)}%`}
                    </span>
                    <span>{formatDuration(result.duration_seconds)}</span>
                    <span>
                      {new Date(result.completed_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
