import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCard } from "@/lib/actions/cards";

export default async function NewCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { setId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: set } = await supabase.from("sets").select("id, name").eq("id", setId).single();
  if (!set) notFound();

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name")
    .eq("set_id", setId)
    .order("created_at");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Add card to {set.name}</h1>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <form action={createCard.bind(null, setId)} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Question (English)</span>
            <input name="question" required placeholder="policeman" className="input input-bordered w-full" />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Answer - hiragana</span>
            <input name="answer_hiragana" placeholder="けいさつかん" className="input input-bordered w-full" />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Answer - romaji</span>
            <input name="answer_romaji" placeholder="keisatsukan" className="input input-bordered w-full" />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Answer - kanji (optional)</span>
            <input name="answer_kanji" placeholder="警察官" className="input input-bordered w-full" />
          </label>
          {groups && groups.length > 0 && (
            <label className="form-control">
              <span className="label-text mb-1">Group (optional)</span>
              <select name="group_id" className="select select-bordered w-full">
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
            Add card
          </button>
        </div>
      </form>
    </div>
  );
}
