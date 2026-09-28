import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { paintColorFor, readableTextColor } from "@/lib/study/groupColors";

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
      <div className="flex items-end justify-between gap-4">
        <h1>Your sets</h1>
        <div className="flex items-center gap-2">
          <span className="text-body-sm hidden sm:inline">Something new?</span>
          <Link href="/sets/new" className="btn btn-primary btn-sm">
            New set
          </Link>
        </div>
      </div>

      {(!sets || sets.length === 0) && (
        <div className="alert">
          <span>No sets yet. Create one to start adding vocab cards.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-iron">
        {sets?.map((set) => {
          const paint = paintColorFor(set.id);
          const ink = readableTextColor(paint);
          const count = (set.cards as unknown as { count: number }[])?.[0]?.count ?? 0;
          return (
            <Link
              key={set.id}
              href={`/sets/${set.id}`}
              className="flex min-h-40 flex-col justify-between gap-6 border-b border-r border-iron p-4 transition-opacity hover:opacity-90"
              style={{ backgroundColor: paint, color: ink }}
            >
              <h2 className="text-subheading break-words">{set.name}</h2>
              <div className="flex flex-col gap-1">
                {set.description && <p className="text-body line-clamp-2">{set.description}</p>}
                <p className="flex items-center gap-2 text-body">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: ink }}
                    aria-hidden="true"
                  />
                  {count} {count === 1 ? "card" : "cards"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-body-sm">Got a share code?</span>
        <Link href="/share" className="btn btn-primary btn-sm">
          Import a set
        </Link>
      </div>
    </div>
  );
}
