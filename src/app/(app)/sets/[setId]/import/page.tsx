import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ImportReview from "@/components/ImportReview";

export default async function ImportPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;

  const supabase = await createClient();
  const { data: set } = await supabase.from("sets").select("id, name").eq("id", setId).single();
  if (!set) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Import into {set.name}</h1>
      <ImportReview setId={setId} />
    </div>
  );
}
