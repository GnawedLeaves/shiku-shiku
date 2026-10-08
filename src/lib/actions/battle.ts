"use server";

// 1v1 flashcard battles. Rooms are created by a host, joined by code/link or
// by accepting an in-app invite, and played live: the lobby, each player's
// progress and the result are pushed to both screens by Supabase Realtime
// (see BattleRoom). Joining, starting and finishing go through database
// functions (supabase/migrations/0007_friends_and_battles.sql) so the
// two-player cap and the winner can't be raced.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(length = 6): string {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

const errorRedirect = (path: string, message: string) =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);

/**
 * Creates a room with the caller as host. Optional form fields: `set_id`
 * (preselects the set, e.g. from "Battle a friend" on a set) and `invite`
 * (a friend's user id to invite straight away, e.g. from their profile).
 */
export async function createBattleRoom(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  // One or more friends to invite straight away (Rematch invites everyone).
  const inviteUserIds = Array.from(
    new Set(formData.getAll("invite").map((v) => String(v).trim()).filter(Boolean))
  );

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: room, error } = await supabase
    .from("battle_rooms")
    .insert({
      code: generateRoomCode(),
      host_id: user.id,
      set_id: setId || null,
      name: name || null,
      status: "lobby",
    })
    .select("id")
    .single();

  if (error || !room) errorRedirect("/battle", error?.message ?? "Could not create the room");

  const { error: memberError } = await supabase
    .from("battle_room_members")
    .insert({ room_id: room!.id, user_id: user.id });
  if (memberError) errorRedirect("/battle", memberError.message);

  if (inviteUserIds.length > 0) {
    // Non-friends are rejected by RLS row by row; the room is still created.
    await supabase
      .from("battle_invites")
      .insert(inviteUserIds.map((to) => ({ room_id: room!.id, from_user: user.id, to_user: to })));
  }

  revalidatePath("/battle");
  redirect(`/battle/${room!.id}`);
}

export async function joinBattleRoom(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) errorRedirect("/battle", "Enter a room code");

  const supabase = await createClient();
  const { data: roomId, error } = await supabase.rpc("join_battle_room", { p_code: code });
  if (error || !roomId) errorRedirect("/battle", error?.message ?? "Room not found");

  revalidatePath("/battle");
  redirect(`/battle/${roomId}`);
}

/** Host invites a friend; they get a drop-down notification in the app. */
export async function inviteToBattle(roomId: string, friendId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  // One live invite per friend per room.
  await supabase
    .from("battle_invites")
    .delete()
    .eq("room_id", roomId)
    .eq("to_user", friendId)
    .eq("status", "pending");

  const { error } = await supabase
    .from("battle_invites")
    .insert({ room_id: roomId, from_user: user.id, to_user: friendId });
  return error ? { error: error.message } : { ok: true as const };
}

export async function acceptBattleInvite(inviteId: string) {
  const supabase = await createClient();
  const { data: roomId, error } = await supabase.rpc("accept_battle_invite", {
    p_invite: inviteId,
  });
  if (error || !roomId) errorRedirect("/battle", error?.message ?? "Couldn't join that battle");

  revalidatePath("/battle");
  redirect(`/battle/${roomId}`);
}

export async function declineBattleInvite(inviteId: string) {
  const supabase = await createClient();
  await supabase.from("battle_invites").update({ status: "declined" }).eq("id", inviteId);
}

/** Host picks the set (from either player's non-private sets). */
export async function setBattleSet(roomId: string, setId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("battle_rooms")
    .update({ set_id: setId || null })
    .eq("id", roomId)
    .eq("status", "lobby");
  // Sends the host's page the saved set with this response, so the picker
  // doesn't flick back to the old value while waiting for Realtime.
  revalidatePath(`/battle/${roomId}`);
  return error ? { error: error.message } : { ok: true as const };
}

/**
 * Host sets how the deck is drawn: shuffled or in set order, and how many
 * cards (null = the whole set). Applied when the battle starts.
 */
export async function setBattleOptions(
  roomId: string,
  options: { shuffle: boolean; cardLimit: number | null }
) {
  const cardLimit =
    options.cardLimit === null ? null : Math.max(1, Math.floor(Number(options.cardLimit) || 1));
  const supabase = await createClient();
  const { error } = await supabase
    .from("battle_rooms")
    .update({ shuffle: options.shuffle, card_limit: cardLimit })
    .eq("id", roomId)
    .eq("status", "lobby");
  revalidatePath(`/battle/${roomId}`);
  return error ? { error: error.message } : { ok: true as const };
}

export async function toggleReady(roomId: string, isReady: boolean) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await supabase
    .from("battle_room_members")
    .update({ is_ready: isReady })
    .eq("room_id", roomId)
    .eq("user_id", user.id);
}

export async function startBattle(roomId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_battle", { p_room: roomId });
  return error ? { error: error.message } : { ok: true as const };
}

/**
 * Leaves the room. Mid-battle that's a forfeit (the other player wins and
 * both rows stay for the results screen); in the lobby the host closing the
 * room removes it for both players.
 */
async function leaveRoom(roomId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .from("battle_rooms")
    .select("host_id, status")
    .eq("id", roomId)
    .maybeSingle();

  if (room?.status === "in_progress") {
    await supabase.rpc("forfeit_battle", { p_room: roomId });
  } else if (room?.status === "lobby") {
    if (room.host_id === user.id) {
      await supabase.from("battle_rooms").delete().eq("id", roomId);
    } else {
      await supabase
        .from("battle_room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", user.id);
    }
  }

  revalidatePath("/battle");
}

/** Leave from inside the room: back to the battles list. */
export async function leaveBattleRoom(roomId: string) {
  await leaveRoom(roomId);
  redirect("/battle");
}

/** Leave from the "you're still in a battle" banner: stay on the current page. */
export async function leaveBattleFromBanner(roomId: string) {
  await leaveRoom(roomId);
}

export async function deleteBattleRoom(roomId: string) {
  const supabase = await createClient();
  await supabase.from("battle_rooms").delete().eq("id", roomId);
  revalidatePath("/battle");
  redirect("/battle");
}
