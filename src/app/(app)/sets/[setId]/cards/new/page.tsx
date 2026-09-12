import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCard } from "@/lib/actions/cards";
import CardFields from "@/components/CardFields";
import SubmitButton from "@/components/ui/SubmitButton";

export default async function NewCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ error?: string; group?: string }>;
}) {
  const { setId } = await params;
  const { error, group } = await searchParams;

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
          <CardFields groups={groups ?? []} selectedGroupIds={group ? [group] : []} />
          <SubmitButton className="btn btn-primary mt-2" pendingText="Adding…">
            Add card
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
