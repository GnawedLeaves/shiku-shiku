import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteSet, generateShareCode, revokeShareCode } from "@/lib/actions/sets";
import { createGroup, renameGroup, deleteGroup } from "@/lib/actions/groups";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import CardsList from "@/components/CardsList";

export default async function SetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { setId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: set }, { data: groups }, { data: cards }, { data: profile }, { data: otherSets }] =
    await Promise.all([
      supabase.from("sets").select("*").eq("id", setId).single(),
      supabase.from("groups").select("id, name").eq("set_id", setId).order("created_at"),
      supabase.from("cards").select("*").eq("set_id", setId).order("created_at"),
      supabase.from("profiles").select("answer_display_mode").eq("id", user.id).single(),
      supabase.from("sets").select("id, name").neq("id", setId).eq("owner_id", user.id),
    ]);

  if (!set) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const shareLink = set.share_code ? `${siteUrl}/share/${set.share_code}` : null;

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{set.name}</h1>
          {set.description && <p className="text-sm opacity-70">{set.description}</p>}
        </div>
        <div className="flex gap-1">
          <Link href={`/sets/${setId}/edit`} className="btn btn-ghost btn-xs">
            Edit
          </Link>
          <form action={deleteSet.bind(null, setId)}>
            <ConfirmSubmitButton confirmText="Delete this set and all its cards?" className="btn btn-ghost btn-xs text-error">
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/study/new?set=${setId}`} className="btn btn-primary btn-sm">
          Start studying
        </Link>
        <Link href={`/sets/${setId}/cards/new`} className="btn btn-outline btn-sm">
          + Add card
        </Link>
        <Link href={`/sets/${setId}/import`} className="btn btn-outline btn-sm">
          Import from PDF/image
        </Link>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-2">
          <h3 className="font-semibold text-sm">Share this set</h3>
          {shareLink ? (
            <div className="flex flex-col gap-2">
              <input readOnly value={shareLink} className="input input-bordered input-sm w-full" />
              <form action={revokeShareCode.bind(null, setId)}>
                <button className="btn btn-ghost btn-xs">Revoke link</button>
              </form>
            </div>
          ) : (
            <form action={generateShareCode.bind(null, setId)}>
              <button className="btn btn-outline btn-sm">Generate share link</button>
            </form>
          )}
        </div>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-2">
          <h3 className="font-semibold text-sm">Groups</h3>
          {groups?.length === 0 && <p className="text-sm opacity-60">No groups yet.</p>}
          {groups?.map((group) => (
            <div key={group.id} className="flex items-center gap-2">
              <form action={renameGroup.bind(null, setId, group.id)} className="flex-1 flex gap-2">
                <input name="name" defaultValue={group.name} className="input input-bordered input-sm flex-1" />
                <button className="btn btn-ghost btn-xs">Save</button>
              </form>
              <form action={deleteGroup.bind(null, setId, group.id)}>
                <ConfirmSubmitButton confirmText="Delete this group? Cards stay, but become ungrouped." className="btn btn-ghost btn-xs text-error">
                  Delete
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
          <form action={createGroup.bind(null, setId)} className="flex gap-2 mt-2">
            <input name="name" required placeholder="New group name" className="input input-bordered input-sm flex-1" />
            <button className="btn btn-outline btn-sm">Add group</button>
          </form>
        </div>
      </div>

      <h2 className="font-semibold">Cards</h2>
      <CardsList
        setId={setId}
        cards={cards ?? []}
        groups={groups ?? []}
        answerMode={profile?.answer_display_mode ?? "both"}
        otherSets={otherSets ?? []}
      />
    </div>
  );
}
