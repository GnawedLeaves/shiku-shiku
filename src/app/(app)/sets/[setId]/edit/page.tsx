import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateSet } from "@/lib/actions/sets";
import BackButton from "@/components/ui/BackButton";
import GroupColorPicker from "@/components/GroupColorPicker";
import SubmitButton from "@/components/ui/SubmitButton";

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
      <BackButton href={`/sets/${setId}`} />
      <h1 className="text-xl font-bold">Edit set</h1>
      <form action={save} className="card bg-base-100">
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
          <div className="form-control my-3">
            <span className="label-text mb-3 block">Colour on the home page</span>
            <GroupColorPicker defaultColor={set.color} noneLabel="Automatic" size="lg" />
            <span className="text-xs opacity-60 mt-3 block">
              × picks a colour automatically. + lets you choose any colour.
            </span>
          </div>
          <SubmitButton className="btn btn-primary mt-2" pendingText="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
