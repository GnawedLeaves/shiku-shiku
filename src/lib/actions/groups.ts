"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidGroupColor } from "@/lib/study/groupColors";

/** Returns a valid hex color from a form field, or null (no color / clear it). */
function readColor(formData: FormData): string | null {
  const raw = String(formData.get("color") ?? "").trim();
  return raw && isValidGroupColor(raw) ? raw : null;
}

export async function createGroup(setId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("groups").insert({ set_id: setId, name, color: readColor(formData) });
  revalidatePath(`/sets/${setId}`);
}

export async function renameGroup(setId: string, groupId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase
    .from("groups")
    .update({ name, color: readColor(formData) })
    .eq("id", groupId);
  revalidatePath(`/sets/${setId}`);
}

export async function deleteGroup(setId: string, groupId: string) {
  const supabase = await createClient();
  await supabase.from("groups").delete().eq("id", groupId);
  revalidatePath(`/sets/${setId}`);
}

/**
 * Tags the selected cards with the selected groups. Existing tags are kept --
 * this adds, it doesn't replace -- and re-tagging an already-tagged card is a
 * no-op rather than an error.
 */
export async function addCardsToGroups(setId: string, cardIds: string[], groupIds: string[]) {
  if (cardIds.length === 0 || groupIds.length === 0) return { added: 0 };

  const supabase = await createClient();
  const links = cardIds.flatMap((cardId) =>
    groupIds.map((groupId) => ({ card_id: cardId, group_id: groupId }))
  );

  const { error } = await supabase.from("card_groups").upsert(links, {
    onConflict: "card_id,group_id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/sets/${setId}`);
  return { added: links.length };
}

/** Creates a group and immediately tags the selected cards with it. */
export async function createGroupWithCards(
  setId: string,
  name: string,
  cardIds: string[],
  color?: string | null
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Group name is required");

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("groups")
    .insert({ set_id: setId, name: trimmed, color: color && isValidGroupColor(color) ? color : null })
    .select("id")
    .single();

  if (error || !group) throw new Error(error?.message ?? "Could not create group");

  if (cardIds.length > 0) {
    await addCardsToGroups(setId, cardIds, [group.id]);
  }

  revalidatePath(`/sets/${setId}`);
  return group.id;
}

export async function removeCardsFromGroup(setId: string, cardIds: string[], groupId: string) {
  if (cardIds.length === 0) return;

  const supabase = await createClient();
  await supabase.from("card_groups").delete().eq("group_id", groupId).in("card_id", cardIds);
  revalidatePath(`/sets/${setId}`);
}
