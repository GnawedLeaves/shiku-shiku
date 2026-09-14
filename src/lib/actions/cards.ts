"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type CardInsert = Database["public"]["Tables"]["cards"]["Insert"];

export interface CardDraft {
  question: string;
  answer_hiragana?: string;
  answer_romaji?: string;
  answer_kanji?: string;
}

async function setCardGroups(cardId: string, groupIds: string[]) {
  const supabase = await createClient();
  await supabase.from("card_groups").delete().eq("card_id", cardId);
  if (groupIds.length === 0) return;
  await supabase
    .from("card_groups")
    .insert(groupIds.map((groupId) => ({ card_id: cardId, group_id: groupId })));
}

export async function createCard(setId: string, formData: FormData) {
  const question = String(formData.get("question") ?? "").trim();
  const answerHiragana = String(formData.get("answer_hiragana") ?? "").trim();
  const answerRomaji = String(formData.get("answer_romaji") ?? "").trim();
  const answerKanji = String(formData.get("answer_kanji") ?? "").trim();
  const groupIds = formData.getAll("group_ids").map(String).filter(Boolean);

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
    })
    .select("id")
    .single();

  if (error || !card) {
    redirect(`/sets/${setId}/cards/new?error=${encodeURIComponent(error?.message ?? "Could not save")}`);
  }

  await setCardGroups(card.id, groupIds);

  revalidatePath(`/sets/${setId}`);
  redirect(`/sets/${setId}`);
}

export async function updateCard(setId: string, cardId: string, formData: FormData) {
  const question = String(formData.get("question") ?? "").trim();
  const answerHiragana = String(formData.get("answer_hiragana") ?? "").trim();
  const answerRomaji = String(formData.get("answer_romaji") ?? "").trim();
  const answerKanji = String(formData.get("answer_kanji") ?? "").trim();
  const groupIds = formData.getAll("group_ids").map(String).filter(Boolean);

  const supabase = await createClient();
  await supabase
    .from("cards")
    .update({
      question,
      answer_hiragana: answerHiragana || null,
      answer_romaji: answerRomaji || null,
      answer_kanji: answerKanji || null,
    })
    .eq("id", cardId);

  await setCardGroups(cardId, groupIds);

  revalidatePath(`/sets/${setId}`);
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

export async function bulkCreateCards(setId: string, rows: CardDraft[], groupIds: string[] = []) {
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

  if (groupIds.length > 0 && inserted) {
    const links = inserted.flatMap((card) =>
      groupIds.map((groupId) => ({ card_id: card.id, group_id: groupId }))
    );
    const { error: linkError } = await supabase.from("card_groups").insert(links);
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath(`/sets/${setId}`);
  return payload.length;
}
