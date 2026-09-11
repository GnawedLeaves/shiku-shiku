import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sets } = await supabase
    .from("sets")
    .select("id, name, description, cards(count)")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your sets</h1>
        <Link href="/sets/new" className="btn btn-primary btn-sm">
          + New set
        </Link>
      </div>

      {(!sets || sets.length === 0) && (
        <div className="alert">
          <span>No sets yet. Create one to start adding vocab cards.</span>
        </div>
      )}

      <div className="grid gap-3">
        {sets?.map((set) => (
          <Link
            key={set.id}
            href={`/sets/${set.id}`}
            className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="card-body p-4">
              <h2 className="card-title text-base">{set.name}</h2>
              {set.description && <p className="text-sm opacity-70">{set.description}</p>}
              <p className="text-xs opacity-50">
                {(set.cards as unknown as { count: number }[])?.[0]?.count ?? 0} cards
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="divider" />

      <Link href="/share" className="btn btn-outline btn-sm self-start">
        Import a shared set
      </Link>
    </div>
  );
}
