import type { AnswerDisplayMode } from "@/lib/supabase/database.types";

interface CardAnswer {
  answer_hiragana: string | null;
  answer_romaji: string | null;
}

export function formatAnswer(card: CardAnswer, mode: AnswerDisplayMode): string {
  const { answer_hiragana, answer_romaji } = card;

  if (mode === "hiragana") return answer_hiragana || answer_romaji || "";
  if (mode === "romaji") return answer_romaji || answer_hiragana || "";

  if (answer_hiragana && answer_romaji) return `${answer_hiragana} (${answer_romaji})`;
  return answer_hiragana || answer_romaji || "";
}
