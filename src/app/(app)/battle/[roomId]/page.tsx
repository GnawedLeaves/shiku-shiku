import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteBattleRoom, leaveBattleRoom, toggleReady } from "@/lib/actions/battle";
import Avatar from "@/components/Avatar";
import SubmitButton from "@/components/ui/SubmitButton";
import BackButton from "@/components/ui/BackButton";

export default async function BattleRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: room }, { data: members }] = await Promise.all([
    supabase.from("battle_rooms").select("*").eq("id", roomId).single(),
    supabase
      .from("battle_room_members")
      .select("user_id, score, is_ready, joined_at")
      .eq("room_id", roomId)
      .order("joined_at"),
  ]);

  if (!room) notFound();

  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", memberIds)
    : { data: [] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const me = (members ?? []).find((member) => member.user_id === user.id);
  const isHost = room.host_id === user.id;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div className="flex flex-col gap-4">
      <BackButton href="/battle" label="Battles" />
      <div>
        <h1 className="text-xl font-bold">{room.name ?? `Room ${room.code}`}</h1>
        <p className="text-sm opacity-60">Status: {room.status}</p>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-2">
          <h2 className="font-semibold text-sm">Invite</h2>
          <p className="text-xs opacity-60">Share this code, or the link below.</p>
          <div className="text-3xl font-bold tracking-[0.3em] text-center py-2">{room.code}</div>
          <input readOnly value={`${siteUrl}/battle/${room.id}`} className="input input-bordered input-sm w-full" />
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-2">
          <h2 className="font-semibold text-sm">Players ({members?.length ?? 0})</h2>
          {(members ?? []).map((member) => {
            const profile = profileById.get(member.user_id);
            return (
              <div key={member.user_id} className="flex items-center gap-3 py-1">
                <Avatar url={profile?.avatar_url} name={profile?.display_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {profile?.display_name ?? "Player"}
                    {member.user_id === room.host_id && (
                      <span className="badge badge-ghost badge-xs ml-2">host</span>
                    )}
                  </p>
                </div>
                <span className={`badge badge-sm ${member.is_ready ? "badge-success" : "badge-ghost"}`}>
                  {member.is_ready ? "ready" : "waiting"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {me && (
          <form action={toggleReady.bind(null, roomId, !me.is_ready)}>
            <SubmitButton
              className={`btn btn-sm ${me.is_ready ? "btn-outline" : "btn-primary"}`}
              pendingText="…"
            >
              {me.is_ready ? "Not ready" : "I'm ready"}
            </SubmitButton>
          </form>
        )}

        <button type="button" className="btn btn-sm btn-disabled" disabled>
          Start battle (coming soon)
        </button>

        {isHost ? (
          <form action={deleteBattleRoom.bind(null, roomId)}>
            <SubmitButton
              className="btn btn-ghost btn-sm text-error"
              pendingText="…"
              confirmText="Close this room for everyone?"
            >
              Close room
            </SubmitButton>
          </form>
        ) : (
          <form action={leaveBattleRoom.bind(null, roomId)}>
            <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">
              Leave room
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
