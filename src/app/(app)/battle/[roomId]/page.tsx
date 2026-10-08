import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getSiteUrl } from "@/lib/siteUrl";
import BattleRoom, { type BattlePlayer } from "@/components/battle/BattleRoom";

export default async function BattleRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: room }, { data: members }] = await Promise.all([
    supabase.from("battle_rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("battle_room_members").select("*").eq("room_id", roomId).order("joined_at"),
  ]);

  // Not a member (RLS hides the room) or it was closed.
  if (!room) notFound();

  const memberIds = (members ?? []).map((m) => m.user_id);
  const isHost = room.host_id === user.id;

  const [{ data: profiles }, { data: myProfile }, { data: setOptions }, { data: friendships }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url").in("id", memberIds),
      supabase.from("profiles").select("answer_display_mode").eq("id", user.id).single(),
      supabase.rpc("battle_set_options", { p_room: roomId }),
      // The host's friends, for the invite list.
      isHost && room.status === "lobby"
        ? supabase
            .from("friendships")
            .select("requester_id, addressee_id")
            .eq("status", "accepted")
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        : Promise.resolve({ data: [] }),
    ]);

  const friendIds = (friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  );
  const { data: friendProfiles } = friendIds.length
    ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", friendIds)
    : { data: [] };

  // The chosen set's name comes from the picker list: the set may belong to
  // the other player, so it isn't readable directly (the deck itself is
  // snapshotted onto the room when the battle starts).
  const chosenSet = (setOptions ?? []).find((option) => option.id === room.set_id);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Points this battle earned the viewer (rewards skeleton, migration 0011).
  const { data: rewards } =
    room.status === "finished"
      ? await supabase
          .from("reward_ledger")
          .select("points")
          .eq("source", "battle")
          .eq("source_id", room.id)
          .eq("user_id", user.id)
      : { data: [] };
  const pointsEarned = (rewards ?? []).reduce((sum, row) => sum + row.points, 0);

  // Members come back in join order, which fixes each player's colour.
  const players: BattlePlayer[] = (members ?? []).map((m, joinIndex) => ({
    joinIndex,
    userId: m.user_id,
    name: profileById.get(m.user_id)?.display_name ?? "Player",
    avatarUrl: profileById.get(m.user_id)?.avatar_url ?? null,
    isHost: m.user_id === room.host_id,
    isReady: m.is_ready,
    queue: m.queue,
    currentIndex: m.current_index,
    cleared: m.cleared,
    dontKnow: m.dont_know,
    firstTry: m.first_try,
    finishedAt: m.finished_at,
    placement: m.placement ?? null,
    forfeitedAt: m.forfeited_at ?? null,
  }));

  return (
    <BattleRoom
      // A fresh mount per phase, so in-game state starts from the server's copy.
      key={room.status}
      meId={user.id}
      room={{
        id: room.id,
        code: room.code,
        name: room.name,
        hostId: room.host_id,
        status: room.status,
        setId: room.set_id,
        setName: chosenSet?.name ?? null,
        deck: room.deck ?? [],
        startedAt: room.started_at,
        finishedAt: room.finished_at,
        winnerId: room.winner_id,
        maxPlayers: room.max_players ?? 5,
        shuffle: room.shuffle ?? true,
        cardLimit: room.card_limit ?? null,
      }}
      pointsEarned={pointsEarned}
      players={players}
      setOptions={(setOptions ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        ownerId: o.owner_id,
        cardCount: Number(o.card_count),
      }))}
      friends={(friendProfiles ?? [])
        .filter((f) => !memberIds.includes(f.id))
        .map((f) => ({ id: f.id, name: f.display_name ?? "Unnamed", avatarUrl: f.avatar_url }))}
      inviteLink={`${await getSiteUrl()}/battle/join/${room.code}`}
      answerMode={myProfile?.answer_display_mode ?? "both"}
    />
  );
}
