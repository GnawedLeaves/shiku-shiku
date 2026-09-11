"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSet(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    redirect(`/sets/new?error=${encodeURIComponent("Name is required")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("sets")
    .insert({ owner_id: user.id, name, description: description || null })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/sets/new?error=${encodeURIComponent(error?.message ?? "Could not create set")}`);
  }

  revalidatePath("/dashboard");
  redirect(`/sets/${data.id}`);
}

export async function updateSet(setId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  const supabase = await createClient();
  await supabase
    .from("sets")
    .update({ name, description: description || null })
    .eq("id", setId);

  revalidatePath(`/sets/${setId}`);
  revalidatePath("/dashboard");
}

export async function deleteSet(setId: string) {
  const supabase = await createClient();
  await supabase.from("sets").delete().eq("id", setId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function generateShareCode(setId: string) {
  const supabase = await createClient();
  const code = randomBytes(6).toString("base64url");

  const { error } = await supabase.from("sets").update({ share_code: code }).eq("id", setId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/sets/${setId}`);
}

export async function revokeShareCode(setId: string) {
  const supabase = await createClient();
  await supabase.from("sets").update({ share_code: null }).eq("id", setId);
  revalidatePath(`/sets/${setId}`);
}

export async function importSharedSet(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) {
    redirect(`/share?error=${encodeURIComponent("Enter a share code")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_shared_set", { p_share_code: code });

  if (error || !data) {
    redirect(`/share?error=${encodeURIComponent(error?.message ?? "Invalid share code")}`);
  }

  revalidatePath("/dashboard");
  redirect(`/sets/${data}`);
}

export async function copyCardsIntoSet(cardIds: string[], targetSetId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_cards_into_set", {
    p_card_ids: cardIds,
    p_target_set_id: targetSetId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/sets/${targetSetId}`);
  return data as number;
}

export async function copyCardsIntoSetForm(setId: string, formData: FormData) {
  const targetSetId = String(formData.get("target_set_id") ?? "");
  const cardIds = formData.getAll("card_ids").map(String);

  if (!targetSetId || cardIds.length === 0) {
    redirect(`/sets/${setId}?error=${encodeURIComponent("Select at least one card and a target set")}`);
  }

  await copyCardsIntoSet(cardIds, targetSetId);
  redirect(`/sets/${targetSetId}`);
}
