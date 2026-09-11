"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type CardInsert = Database["public"]["Tables"]["cards"]["Insert"];

export async function createCard(setId: string, formData: FormData) {
  const question = String(formData.get("question") ?? "").trim();
  const answerHiragana = String(formData.get("answer_hiragana") ?? "").trim();
  const answerRomaji = String(formData.get("answer_romaji") ?? "").trim();
  const answerKanji = String(formData.get("answer_kanji") ?? "").trim();
  const groupId = String(formData.get("group_id") ?? "").trim();

  if (!question || (!answerHiragana && !answerRomaji)) {
    redirect(
      `/sets/${setId}/cards/new?error=${encodeURIComponent(
        "A question and at least one of hiragana/romaji are required"
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cards").insert({
    set_id: setId,
    group_id: groupId || null,
    question,
    answer_hiragana: answerHiragana || null,
    answer_romaji: answerRomaji || null,
    answer_kanji: answerKanji || null,
  });

  if (error) {
    redirect(`/sets/${setId}/cards/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/sets/${setId}`);
  redirect(`/sets/${setId}`);
}

export async function updateCard(setId: string, cardId: string, formData: FormData) {
  const question = String(formData.get("question") ?? "").trim();
  const answerHiragana = String(formData.get("answer_hiragana") ?? "").trim();
  const answerRomaji = String(formData.get("answer_romaji") ?? "").trim();
  const answerKanji = String(formData.get("answer_kanji") ?? "").trim();
  const groupId = String(formData.get("group_id") ?? "").trim();

  const supabase = await createClient();
  await supabase
    .from("cards")
    .update({
      question,
      group_id: groupId || null,
      answer_hiragana: answerHiragana || null,
      answer_romaji: answerRomaji || null,
      answer_kanji: answerKanji || null,
    })
    .eq("id", cardId);

  revalidatePath(`/sets/${setId}`);
  redirect(`/sets/${setId}`);
}

export async function deleteCard(setId: string, cardId: string) {
  const supabase = await createClient();
  await supabase.from("cards").delete().eq("id", cardId);
  revalidatePath(`/sets/${setId}`);
}

export async function bulkCreateCards(setId: string, rows: Array<{ question: string; answer_hiragana?: string; answer_romaji?: string }>) {
  const supabase = await createClient();
  const payload: CardInsert[] = rows
    .filter((r) => r.question.trim() && (r.answer_hiragana?.trim() || r.answer_romaji?.trim()))
    .map((r) => ({
      set_id: setId,
      question: r.question.trim(),
      answer_hiragana: r.answer_hiragana?.trim() || null,
      answer_romaji: r.answer_romaji?.trim() || null,
    }));

  if (payload.length === 0) return 0;

  const { error } = await supabase.from("cards").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath(`/sets/${setId}`);
  return payload.length;
}
