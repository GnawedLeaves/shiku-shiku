"use server";

// Battle mode skeleton: rooms can be created, shared by code, joined and left.
// Live gameplay (question sync, per-answer scoring, realtime presence) is not
// implemented yet -- the schema and screens exist so it can be layered on.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(length = 6): string {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export async function createBattleRoom(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  if (error || !room) {
    redirect(`/battle?error=${encodeURIComponent(error?.message ?? "Could not create the room")}`);
  }

  await supabase.from("battle_room_members").insert({ room_id: room.id, user_id: user.id });

  revalidatePath("/battle");
  redirect(`/battle/${room.id}`);
}

export async function joinBattleRoom(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) redirect(`/battle?error=${encodeURIComponent("Enter a room code")}`);

  const supabase = await createClient();
  const { data: roomId, error } = await supabase.rpc("join_battle_room", { p_code: code });

  if (error || !roomId) {
    redirect(`/battle?error=${encodeURIComponent(error?.message ?? "Room not found")}`);
  }

  revalidatePath("/battle");
  redirect(`/battle/${roomId}`);
}

export async function toggleReady(roomId: string, isReady: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("battle_room_members")
    .update({ is_ready: isReady })
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  revalidatePath(`/battle/${roomId}`);
}

export async function leaveBattleRoom(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("battle_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  revalidatePath("/battle");
  redirect("/battle");
}

export async function deleteBattleRoom(roomId: string) {
  const supabase = await createClient();
  await supabase.from("battle_rooms").delete().eq("id", roomId);
  revalidatePath("/battle");
  redirect("/battle");
}
