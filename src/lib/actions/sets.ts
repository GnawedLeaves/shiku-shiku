"use server";

import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isValidGroupColor } from "@/lib/study/groupColors";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function createSet(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    redirect(`/sets/new?error=${encodeURIComponent("Name is required")}`);
  }

  const supabase = await createClient();
  const user = await getCurrentUser();
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
  // Empty or invalid means "automatic" -- the dashboard picks a paint colour.
  const rawColor = String(formData.get("color") ?? "").trim();
  const color = rawColor && isValidGroupColor(rawColor) ? rawColor : null;

  const supabase = await createClient();
  await supabase
    .from("sets")
    .update({ name, description: description || null, color, is_private: formData.get("is_private") === "on" })
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

// No 0/O, 1/I/L: share codes get read aloud and typed on phones, so every
// character should be unambiguous. 31^8 is plenty of room against collisions.
const SHARE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newShareCode(): string {
  return Array.from({ length: 8 }, () => SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)]).join("");
}

/**
 * Turns whatever the user pasted -- a bare code or a full share link, with
 * stray spaces -- into just the code.
 */
function parseShareInput(raw: string): string {
  const trimmed = raw.trim();
  const fromLink = trimmed.match(/\/share\/([^/?#\s]+)/);
  return (fromLink ? decodeURIComponent(fromLink[1]) : trimmed).replace(/\s+/g, "");
}

export async function generateShareCode(setId: string) {
  const supabase = await createClient();
  const code = newShareCode();

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
  const code = parseShareInput(String(formData.get("code") ?? ""));
  if (!code) {
    redirect(`/share?error=${encodeURIComponent("Enter a share code")}`);
  }

  const supabase = await createClient();
  let { data, error } = await supabase.rpc("import_shared_set", { p_share_code: code });

  // Codes are upper-case now, but phones like to change the case of what's
  // typed. Older mixed-case codes are tried exactly as entered first.
  if ((error || !data) && code !== code.toUpperCase()) {
    ({ data, error } = await supabase.rpc("import_shared_set", {
      p_share_code: code.toUpperCase(),
    }));
  }

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
