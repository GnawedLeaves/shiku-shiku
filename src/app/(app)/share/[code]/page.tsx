import { importSharedSet } from "@/lib/actions/sets";

export default async function ShareLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Import shared set</h1>
      <p className="text-sm opacity-70">
        Someone shared a flashcard set with you. Importing adds your own copy to your library — it
        won&apos;t affect theirs.
      </p>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <form action={importSharedSet} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <p className="text-sm">
            Share code: <span className="font-mono font-semibold">{code}</span>
          </p>
          <input type="hidden" name="code" value={code} />
          <button type="submit" className="btn btn-primary">
            Import into my library
          </button>
        </div>
      </form>
    </div>
  );
}
