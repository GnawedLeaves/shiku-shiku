import { importSharedSet } from "@/lib/actions/sets";

export default async function ShareImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Import a shared set</h1>
      <p className="text-sm opacity-70">
        Paste a share code or the link a friend sent you to add a copy of their set to your own library.
      </p>

      {params.error && <div className="alert alert-error text-sm py-2">{params.error}</div>}

      <form action={importSharedSet} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Share code</span>
            <input name="code" required className="input input-bordered w-full" placeholder="e.g. aB3xY9" />
          </label>
          <button type="submit" className="btn btn-primary mt-2">
            Import set
          </button>
        </div>
      </form>
    </div>
  );
}
