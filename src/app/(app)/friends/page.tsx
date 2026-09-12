import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";
import FriendSearch from "@/components/FriendSearch";
import SubmitButton from "@/components/ui/SubmitButton";

interface ProfileSummary {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: friendships } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const rows = friendships ?? [];
  const otherIds = rows.map((row) =>
    row.requester_id === user.id ? row.addressee_id : row.requester_id
  );

  const { data: profiles } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", otherIds)
    : { data: [] as ProfileSummary[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as ProfileSummary]));
  const personFor = (row: (typeof rows)[number]) =>
    profileById.get(row.requester_id === user.id ? row.addressee_id : row.requester_id);

  const friends = rows.filter((row) => row.status === "accepted");
  const incoming = rows.filter((row) => row.status === "pending" && row.addressee_id === user.id);
  const outgoing = rows.filter((row) => row.status === "pending" && row.requester_id === user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Friends</h1>

      <FriendSearch />

      {incoming.length > 0 && (
        <section className="card bg-base-100 shadow-sm">
          <div className="card-body p-4 gap-3">
            <h2 className="font-semibold text-sm">
              Requests received <span className="badge badge-primary badge-sm">{incoming.length}</span>
            </h2>
            {incoming.map((row) => {
              const person = personFor(row);
              return (
                <div key={row.id} className="flex items-center gap-3">
                  <Avatar url={person?.avatar_url} name={person?.display_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{person?.display_name ?? "Unnamed"}</p>
                    {person?.username && <p className="text-xs opacity-60">@{person.username}</p>}
                  </div>
                  <form action={acceptFriendRequest.bind(null, row.id)}>
                    <SubmitButton className="btn btn-primary btn-xs" pendingText="…">
                      Accept
                    </SubmitButton>
                  </form>
                  <form action={declineFriendRequest.bind(null, row.id)}>
                    <SubmitButton className="btn btn-ghost btn-xs" pendingText="…">
                      Decline
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-3">
          <h2 className="font-semibold text-sm">Your friends ({friends.length})</h2>
          {friends.length === 0 && (
            <p className="text-sm opacity-60">No friends yet — search for someone above.</p>
          )}
          {friends.map((row) => {
            const person = personFor(row);
            return (
              <div key={row.id} className="flex items-center gap-3">
                <Avatar url={person?.avatar_url} name={person?.display_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{person?.display_name ?? "Unnamed"}</p>
                  {person?.username && <p className="text-xs opacity-60">@{person.username}</p>}
                </div>
                <form action={removeFriendship.bind(null, row.id)}>
                  <SubmitButton
                    className="btn btn-ghost btn-xs text-error"
                    pendingText="…"
                    confirmText="Remove this friend?"
                  >
                    Remove
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {outgoing.length > 0 && (
        <section className="card bg-base-100 shadow-sm">
          <div className="card-body p-4 gap-3">
            <h2 className="font-semibold text-sm">Requests sent ({outgoing.length})</h2>
            {outgoing.map((row) => {
              const person = personFor(row);
              return (
                <div key={row.id} className="flex items-center gap-3">
                  <Avatar url={person?.avatar_url} name={person?.display_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{person?.display_name ?? "Unnamed"}</p>
                    <p className="text-xs opacity-60">Pending</p>
                  </div>
                  <form action={removeFriendship.bind(null, row.id)}>
                    <SubmitButton className="btn btn-ghost btn-xs" pendingText="…">
                      Cancel
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
