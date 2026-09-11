"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createGroup(setId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("groups").insert({ set_id: setId, name });
  revalidatePath(`/sets/${setId}`);
}

export async function renameGroup(setId: string, groupId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("groups").update({ name }).eq("id", groupId);
  revalidatePath(`/sets/${setId}`);
}

export async function deleteGroup(setId: string, groupId: string) {
  const supabase = await createClient();
  await supabase.from("groups").delete().eq("id", groupId);
  revalidatePath(`/sets/${setId}`);
}
