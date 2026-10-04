"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { isValidGroupColor } from "@/lib/study/groupColors";
import { normalizeRemarks } from "@/lib/study/remarks";

type CardInsert = Database["public"]["Tables"]["cards"]["Insert"];

export interface CardDraft {
  question: string;
  answer_hiragana?: string;
  answer_romaji?: string;
  answer_kanji?: string;
}

/**
 * Creates the group typed into the "+ New group" field, if any, and returns
 * its id so the new card(s) can be added to it. Null when no name was given.
 */
async function createGroupIfRequested(
  setId: string,
  draft: { name?: string | null; color?: string | null } | null | undefined
): Promise<string | null> {
  const name = draft?.name?.trim();
  if (!name) return null;
  const color = draft?.color && isValidGroupColor(draft.color) ? draft.color : null;

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("groups")
    .insert({ set_id: setId, name, color })
    .select("id")
    .single();
  if (error || !group) throw new Error(error?.message ?? "Could not create group");
  return group.id;
}

function newGroupFromForm(formData: FormData) {
  return {
    name: String(formData.get("new_group_name") ?? ""),
    color: String(formData.get("new_group_color") ?? ""),
  };
}

async function setCardGroups(cardId: string, groupIds: string[]) {
  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("card_groups").delete().eq("card_id", cardId);
  if (deleteError) throw new Error(deleteError.message);
  if (groupIds.length === 0) return;
  // Upsert, so a second save racing this one can't fail on a duplicate link.
  const { error } = await supabase
    .from("card_groups")
    .upsert(
      groupIds.map((groupId) => ({ card_id: cardId, group_id: groupId })),
      { onConflict: "card_id,group_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

/**
 * Applies the form's group choices (and any new group) to a card. Returns an
 * error message instead of throwing, so the form can show it rather than the
 * page crashing.
 */
async function saveCardGroups(setId: string, cardId: string, formData: FormData) {
  const groupIds = formData.getAll("group_ids").map(String).filter(Boolean);
  try {
    const newGroupId = await createGroupIfRequested(setId, newGroupFromForm(formData));
    await setCardGroups(cardId, newGroupId ? [...groupIds, newGroupId] : groupIds);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not update this card's groups";
  }
}

export async function createCard(setId: string, formData: FormData) {
  const question = String(formData.get("question") ?? "").trim();
  const answerHiragana = String(formData.get("answer_hiragana") ?? "").trim();
  const answerRomaji = String(formData.get("answer_romaji") ?? "").trim();
  const answerKanji = String(formData.get("answer_kanji") ?? "").trim();

  if (!question || (!answerHiragana && !answerRomaji)) {
    redirect(
      `/sets/${setId}/cards/new?error=${encodeURIComponent(
        "A question and at least one of hiragana/romaji are required"
      )}`
    );
  }

  const supabase = await createClient();
  const { data: card, error } = await supabase
    .from("cards")
    .insert({
      set_id: setId,
      question,
      answer_hiragana: answerHiragana || null,
      answer_romaji: answerRomaji || null,
      answer_kanji: answerKanji || null,
      notes: normalizeRemarks(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error || !card) {
    redirect(`/sets/${setId}/cards/new?error=${encodeURIComponent(error?.message ?? "Could not save")}`);
  }

  const groupError = await saveCardGroups(setId, card.id, formData);
  revalidatePath(`/sets/${setId}`);
  if (groupError) {
    // The card itself saved; send them to edit it with the problem shown.
    redirect(
      `/sets/${setId}/cards/${card.id}/edit?error=${encodeURIComponent(
        `The card was saved, but its groups weren't: ${groupError}`
      )}`
    );
  }
  redirect(`/sets/${setId}`);
}

export async function updateCard(setId: string, cardId: string, formData: FormData) {
  const question = String(formData.get("question") ?? "").trim();
  const answerHiragana = String(formData.get("answer_hiragana") ?? "").trim();
  const answerRomaji = String(formData.get("answer_romaji") ?? "").trim();
  const answerKanji = String(formData.get("answer_kanji") ?? "").trim();
  const editUrl = (message: string) =>
    `/sets/${setId}/cards/${cardId}/edit?error=${encodeURIComponent(message)}`;

  if (!question || (!answerHiragana && !answerRomaji)) {
    redirect(editUrl("A question and at least one of hiragana/romaji are required"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cards")
    .update({
      question,
      answer_hiragana: answerHiragana || null,
      answer_romaji: answerRomaji || null,
      answer_kanji: answerKanji || null,
      notes: normalizeRemarks(formData.get("notes")),
    })
    .eq("id", cardId);
  if (error) redirect(editUrl(`Couldn't save this card: ${error.message}`));

  const groupError = await saveCardGroups(setId, cardId, formData);
  revalidatePath(`/sets/${setId}`);
  if (groupError) redirect(editUrl(`The card was saved, but its groups weren't: ${groupError}`));
  redirect(`/sets/${setId}`);
}

export async function deleteCard(setId: string, cardId: string) {
  const supabase = await createClient();
  await supabase.from("cards").delete().eq("id", cardId);
  revalidatePath(`/sets/${setId}`);
}

/** Deletes every selected card in one request. RLS still scopes this to the caller's own sets. */
export async function deleteCards(setId: string, cardIds: string[]) {
  if (cardIds.length === 0) return 0;

  const supabase = await createClient();
  const { error } = await supabase.from("cards").delete().in("id", cardIds);
  if (error) throw new Error(error.message);

  revalidatePath(`/sets/${setId}`);
  return cardIds.length;
}

export async function bulkCreateCards(
  setId: string,
  rows: CardDraft[],
  groupIds: string[] = [],
  newGroup?: { name: string; color: string | null } | null
) {
  const supabase = await createClient();

  const payload: CardInsert[] = rows
    .filter((r) => r.question.trim() && (r.answer_hiragana?.trim() || r.answer_romaji?.trim()))
    .map((r) => ({
      set_id: setId,
      question: r.question.trim(),
      answer_hiragana: r.answer_hiragana?.trim() || null,
      answer_romaji: r.answer_romaji?.trim() || null,
      answer_kanji: r.answer_kanji?.trim() || null,
    }));

  if (payload.length === 0) return 0;

  const { data: inserted, error } = await supabase.from("cards").insert(payload).select("id");
  if (error) throw new Error(error.message);

  // Created only once the cards are in, so a failed import leaves no empty group.
  const newGroupId = await createGroupIfRequested(setId, newGroup);
  const allGroupIds = newGroupId ? [...groupIds, newGroupId] : groupIds;

  if (allGroupIds.length > 0 && inserted) {
    const links = inserted.flatMap((card) =>
      allGroupIds.map((groupId) => ({ card_id: card.id, group_id: groupId }))
    );
    const { error: linkError } = await supabase.from("card_groups").insert(links);
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath(`/sets/${setId}`);
  return payload.length;
}
