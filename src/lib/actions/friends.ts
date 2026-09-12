"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Finds people by username or display name, excluding the caller. */
export async function searchUsers(query: string) {
  const term = query.trim();
  if (term.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const pattern = `%${term.replace(/[%_]/g, "")}%`;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .neq("id", user.id)
    .limit(10);

  return data ?? [];
}

export async function sendFriendRequest(addresseeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (addresseeId === user.id) {
    return { error: "You can't add yourself" };
  }

  // A pair is unique in either direction, so reuse whatever row already exists.
  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status, requester_id")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${addresseeId}),` +
        `and(requester_id.eq.${addresseeId},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return { error: "You're already friends" };
    if (existing.status === "pending") {
      if (existing.requester_id === user.id) return { error: "Request already sent" };
      // They already asked us -- adding them back just accepts it.
      await acceptFriendRequest(existing.id);
      return { ok: true as const };
    }
    // Previously declined: re-open it from the current requester's side.
    const { error } = await supabase
      .from("friendships")
      .update({ status: "pending", requester_id: user.id, addressee_id: addresseeId })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: addresseeId, status: "pending" });
    if (error) return { error: error.message };
  }

  revalidatePath("/friends");
  return { ok: true as const };
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only the person who received the request may accept it.
  await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId)
    .eq("addressee_id", user.id);

  revalidatePath("/friends");
}

export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("friendships")
    .update({ status: "declined" })
    .eq("id", friendshipId)
    .eq("addressee_id", user.id);

  revalidatePath("/friends");
}

/** Used for both cancelling a sent request and removing an existing friend. */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("friendships").delete().eq("id", friendshipId);

  revalidatePath("/friends");
}
