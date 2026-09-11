import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateCard } from "@/lib/actions/cards";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ setId: string; cardId: string }>;
}) {
  const { setId, cardId } = await params;

  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("*").eq("id", cardId).single();
  if (!card) notFound();

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name")
    .eq("set_id", setId)
    .order("created_at");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Edit card</h1>

      <form action={updateCard.bind(null, setId, cardId)} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Question (English)</span>
            <input name="question" required defaultValue={card.question} className="input input-bordered w-full" />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Answer - hiragana</span>
            <input
              name="answer_hiragana"
              defaultValue={card.answer_hiragana ?? ""}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Answer - romaji</span>
            <input
              name="answer_romaji"
              defaultValue={card.answer_romaji ?? ""}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Answer - kanji (optional)</span>
            <input
              name="answer_kanji"
              defaultValue={card.answer_kanji ?? ""}
              className="input input-bordered w-full"
            />
          </label>
          {groups && groups.length > 0 && (
            <label className="form-control">
              <span className="label-text mb-1">Group (optional)</span>
              <select name="group_id" defaultValue={card.group_id ?? ""} className="select select-bordered w-full">
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="btn btn-primary mt-2">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
