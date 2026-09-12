import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function SetScoreboardPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: set } = await supabase
    .from("sets")
    .select("id, name, share_code, origin_set_id")
    .eq("id", setId)
    .single();
  if (!set) notFound();

  // Pools scores from this set and every copy imported from the same original.
  const { data: rows, error } = await supabase.rpc("set_scoreboard", { p_set_id: setId });
  const scores = rows ?? [];
  const isShared = Boolean(set.share_code || set.origin_set_id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/sets/${setId}`} className="btn btn-ghost btn-xs mb-1">
          ← {set.name}
        </Link>
        <h1 className="text-xl font-bold">Scoreboard</h1>
        <p className="text-sm opacity-60">
          Best score per person across this set and every shared copy of it.
        </p>
      </div>

      {!isShared && (
        <div className="alert text-sm py-2">
          <span>
            This set hasn&apos;t been shared, so only your own scores appear. Generate a share link
            on the set page to compare with friends.
          </span>
        </div>
      )}

      {error && <div className="alert alert-error text-sm py-2">{error.message}</div>}

      {scores.length === 0 ? (
        <div className="alert">
          <span>No finished sessions for this set yet.</span>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-2">
            {scores.map((row, index) => (
              <div
                key={row.user_id}
                className={`flex items-center gap-3 p-2 rounded-box ${
                  row.user_id === user.id ? "bg-primary/10" : ""
                }`}
              >
                <span className="w-6 text-center font-semibold">
                  {MEDALS[index] ?? index + 1}
                </span>
                <Avatar url={row.avatar_url} name={row.display_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {row.display_name ?? "Anonymous"}
                    {row.user_id === user.id && <span className="ml-1 text-xs opacity-60">(you)</span>}
                  </p>
                  <p className="text-xs opacity-60">
                    {row.sessions_played} session{row.sessions_played === 1 ? "" : "s"} ·{" "}
                    {new Date(row.last_played).toLocaleDateString()}
                  </p>
                </div>
                <span className="badge badge-primary">{Math.round(row.best_score)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
