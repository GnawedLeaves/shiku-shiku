import { createClient } from "@/lib/supabase/server";
import StudySessionForm from "@/components/StudySessionForm";
import SessionsList from "@/components/SessionsList";
import type { QueueEntry } from "@/lib/supabase/database.types";

export default async function NewStudySessionPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: sets }, { data: groups }, { data: sessions }] = await Promise.all([
    supabase.from("sets").select("id, name").eq("owner_id", user!.id).order("name"),
    supabase.from("groups").select("id, name, set_id").order("created_at"),
    supabase
      .from("study_sessions")
      .select("id, name, status, current_index, queue")
      .eq("user_id", user!.id)
      .neq("status", "completed")
      .order("updated_at", { ascending: false }),
  ]);

  const groupsBySetId: Record<string, { id: string; name: string }[]> = {};
  for (const g of groups ?? []) {
    (groupsBySetId[g.set_id] ??= []).push({ id: g.id, name: g.name });
  }

  const sessionRows = (sessions ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    current_index: s.current_index,
    queueLength: (s.queue as QueueEntry[]).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Study</h1>

      {params.error && <div className="alert alert-error text-sm py-2">{params.error}</div>}

      {sessionRows.length > 0 && (
        <div>
          <h2 className="font-semibold mb-2">Continue a session</h2>
          <SessionsList sessions={sessionRows} />
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-2">Start a new session</h2>
        <StudySessionForm sets={sets ?? []} groupsBySetId={groupsBySetId} initialSetId={params.set} />
      </div>
    </div>
  );
}
