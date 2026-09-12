import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBattleRoom, joinBattleRoom } from "@/lib/actions/battle";
import SubmitButton from "@/components/ui/SubmitButton";

export default async function BattlePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: sets }, { data: memberships }] = await Promise.all([
    supabase.from("sets").select("id, name").eq("owner_id", user.id).order("name"),
    supabase
      .from("battle_room_members")
      .select("room_id, battle_rooms(id, code, name, status, created_at)")
      .eq("user_id", user.id),
  ]);

  const rooms = (memberships ?? [])
    .map((membership) => membership.battle_rooms)
    .filter((room): room is NonNullable<typeof room> => Boolean(room))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Flashcard battles</h1>
        <p className="text-sm opacity-60">
          Create a room, share the code, and see who joins.
        </p>
      </div>

      <div className="alert alert-info text-sm py-2">
        <span>
          Early preview: rooms, invites and the lobby work. Live head-to-head rounds are still to
          come.
        </span>
      </div>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-3">
          <h2 className="font-semibold text-sm">Create a room</h2>
          <form action={createBattleRoom} className="flex flex-col gap-2">
            <input
              name="name"
              placeholder="Room name (optional)"
              className="input input-bordered input-sm w-full"
            />
            <select name="set_id" className="select select-bordered select-sm w-full" defaultValue="">
              <option value="">Pick a set (optional)</option>
              {(sets ?? []).map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
            <SubmitButton className="btn btn-primary btn-sm self-start" pendingText="Creating…">
              Create room
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-3">
          <h2 className="font-semibold text-sm">Join with a code</h2>
          <form action={joinBattleRoom} className="flex gap-2">
            <input
              name="code"
              placeholder="ABC123"
              className="input input-bordered input-sm flex-1 uppercase"
              maxLength={8}
            />
            <SubmitButton className="btn btn-outline btn-sm" pendingText="Joining…">
              Join
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-2">
          <h2 className="font-semibold text-sm">Your rooms</h2>
          {rooms.length === 0 && <p className="text-sm opacity-60">You&apos;re not in any rooms yet.</p>}
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/battle/${room.id}`}
              className="flex items-center justify-between gap-2 py-2 border-b border-base-200 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{room.name ?? `Room ${room.code}`}</p>
                <p className="text-xs opacity-60">Code {room.code}</p>
              </div>
              <span className="badge badge-ghost badge-sm">{room.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
