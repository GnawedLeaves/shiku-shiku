import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateCard } from "@/lib/actions/cards";
import CardFields from "@/components/CardFields";
import SubmitButton from "@/components/ui/SubmitButton";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ setId: string; cardId: string }>;
}) {
  const { setId, cardId } = await params;

  const supabase = await createClient();
  const [{ data: card }, { data: groups }, { data: links }] = await Promise.all([
    supabase.from("cards").select("*").eq("id", cardId).single(),
    supabase.from("groups").select("id, name").eq("set_id", setId).order("created_at"),
    supabase.from("card_groups").select("group_id").eq("card_id", cardId),
  ]);

  if (!card) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Edit card</h1>

      <form action={updateCard.bind(null, setId, cardId)} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <CardFields
            groups={groups ?? []}
            selectedGroupIds={(links ?? []).map((link) => link.group_id)}
            defaults={{
              question: card.question,
              answer_hiragana: card.answer_hiragana ?? "",
              answer_romaji: card.answer_romaji ?? "",
              answer_kanji: card.answer_kanji ?? "",
            }}
          />
          <SubmitButton className="btn btn-primary mt-2" pendingText="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
