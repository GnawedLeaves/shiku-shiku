import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateSet } from "@/lib/actions/sets";

export default async function EditSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const supabase = await createClient();
  const { data: set } = await supabase.from("sets").select("*").eq("id", setId).single();
  if (!set) notFound();

  async function save(formData: FormData) {
    "use server";
    await updateSet(setId, formData);
    redirect(`/sets/${setId}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Edit set</h1>
      <form action={save} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Name</span>
            <input name="name" required defaultValue={set.name} className="input input-bordered w-full" />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Description</span>
            <textarea
              name="description"
              defaultValue={set.description ?? ""}
              className="textarea textarea-bordered w-full"
              rows={3}
            />
          </label>
          <button type="submit" className="btn btn-primary mt-2">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
