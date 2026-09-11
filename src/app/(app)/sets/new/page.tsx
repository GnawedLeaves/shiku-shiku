import { createSet } from "@/lib/actions/sets";

export default async function NewSetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">New set</h1>

      {params.error && <div className="alert alert-error text-sm py-2">{params.error}</div>}

      <form action={createSet} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Name</span>
            <input name="name" required className="input input-bordered w-full" placeholder="JLPT N5 Vocab" />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Description (optional)</span>
            <textarea name="description" className="textarea textarea-bordered w-full" rows={3} />
          </label>
          <button type="submit" className="btn btn-primary mt-2">
            Create set
          </button>
        </div>
      </form>
    </div>
  );
}
