import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteSet, generateShareCode, revokeShareCode } from "@/lib/actions/sets";
import { createGroup, renameGroup, deleteGroup } from "@/lib/actions/groups";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import CardsList from "@/components/CardsList";
import SubmitButton from "@/components/ui/SubmitButton";
import GroupColorPicker from "@/components/GroupColorPicker";
import BackButton from "@/components/ui/BackButton";
import { getSiteUrl } from "@/lib/siteUrl";
import CopyField from "@/components/CopyField";
import LinkButton from "@/components/ui/LinkButton";

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
      supabase.from("groups").select("id, name, color").eq("set_id", setId).order("created_at"),
      supabase
        .from("cards")
        .select("id, question, answer_hiragana, answer_romaji, created_at, card_groups(group_id)")
        .eq("set_id", setId)
        .order("created_at"),
      supabase.from("profiles").select("answer_display_mode").eq("id", user.id).single(),
      supabase.from("sets").select("id, name").neq("id", setId).eq("owner_id", user.id),
    ]);

  if (!set) notFound();

  const siteUrl = await getSiteUrl();
  const shareLink = set.share_code ? `${siteUrl}/share/${set.share_code}` : null;

  const cardRows = (cards ?? []).map((card) => ({
    id: card.id,
    question: card.question,
    answer_hiragana: card.answer_hiragana,
    answer_romaji: card.answer_romaji,
    created_at: card.created_at,
    groupIds: (card.card_groups ?? []).map((link: { group_id: string }) => link.group_id),
  }));

  return (
    <div className="flex flex-col gap-4">
      <BackButton href="/dashboard" />

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold break-words">{set.name}</h1>
          {set.description && <p className="text-sm opacity-70">{set.description}</p>}
        </div>
        <div className="flex gap-1">
          <LinkButton href={`/sets/${setId}/edit`} className="btn btn-ghost btn-xs">
            Edit
          </LinkButton>
          <form action={deleteSet.bind(null, setId)}>
            <ConfirmSubmitButton
              confirmText="Delete this set and all its cards?"
              className="btn btn-ghost btn-xs text-error"
              pendingText="Deleting…"
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/study/new?set=${setId}`} className="btn btn-primary btn-sm">
          Start studying
        </LinkButton>
        <LinkButton href={`/sets/${setId}/cards/new`} className="btn btn-outline btn-sm">
          + Add card
        </LinkButton>
        <LinkButton href={`/sets/${setId}/import`} className="btn btn-outline btn-sm">
          Import from PDF
        </LinkButton>
        <LinkButton href={`/sets/${setId}/scoreboard`} className="btn btn-outline btn-sm">
          Scoreboard
        </LinkButton>
      </div>

      <div className="flex flex-col">
        <Disclosure title="Share" summary={shareLink ? "Link active" : "Not shared"}>
          {shareLink && set.share_code ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm opacity-60">
                Send the link, or read out the code — friends enter it under Sets → Import a set.
              </p>
              <CopyField label="Link" value={shareLink} />
              <CopyField label="Code" value={set.share_code} large />
              <form action={revokeShareCode.bind(null, setId)}>
                <SubmitButton className="btn btn-ghost btn-xs" pendingText="Revoking…">
                  Revoke link
                </SubmitButton>
              </form>
            </div>
          ) : (
            <form action={generateShareCode.bind(null, setId)}>
              <SubmitButton className="btn btn-outline btn-sm" pendingText="Generating…">
                Generate share link
              </SubmitButton>
            </form>
          )}
        </Disclosure>

        <Disclosure
          title="Groups"
          summary={
            groups?.length ? `${groups.length} group${groups.length === 1 ? "" : "s"}` : "None yet"
          }
        >
          <p className="text-xs opacity-60">
            Groups work like tags — add cards to them from the list below.
          </p>
          {groups?.length === 0 && <p className="text-sm opacity-60">No groups yet.</p>}
          {groups?.map((group) => (
            <div key={group.id} className="flex flex-wrap items-center gap-2 py-1">
              <form
                action={renameGroup.bind(null, setId, group.id)}
                className="flex flex-1 flex-wrap items-center gap-2 min-w-0"
              >
                <input
                  name="name"
                  defaultValue={group.name}
                  className="input input-bordered input-sm flex-1 min-w-32"
                />
                <GroupColorPicker defaultColor={group.color} />
                <SubmitButton className="btn btn-ghost btn-xs" pendingText="Saving…">
                  Save
                </SubmitButton>
              </form>
              <form action={deleteGroup.bind(null, setId, group.id)}>
                <ConfirmSubmitButton
                  confirmText="Delete this group? Cards stay, but lose this tag."
                  className="btn btn-ghost btn-xs text-error"
                  pendingText="Deleting…"
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
          <form
            action={createGroup.bind(null, setId)}
            className="flex flex-wrap items-center gap-2 mt-2"
          >
            <input
              name="name"
              required
              placeholder="New group name"
              className="input input-bordered input-sm flex-1 min-w-32"
            />
            <GroupColorPicker />
            <SubmitButton className="btn btn-outline btn-sm" pendingText="Adding…">
              Add group
            </SubmitButton>
          </form>
        </Disclosure>
      </div>

      <h2 className="font-semibold">Cards</h2>
      <CardsList
        setId={setId}
        cards={cardRows}
        groups={groups ?? []}
        answerMode={profile?.answer_display_mode ?? "both"}
        otherSets={otherSets ?? []}
      />
    </div>
  );
}

/**
 * Collapsed-by-default panel for secondary set tools (sharing, groups), so the
 * card list stays the focus of the page. Native <details> keeps it
 * server-rendered, and its open state survives the refresh after a form action.
 */
function Disclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border border-iron -mt-px first:mt-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="text-body-sm">{title}</span>
        <span className="text-sm opacity-60">{summary}</span>
        <span
          className="ml-auto text-lg leading-none transition-transform group-open:rotate-45"
          aria-hidden="true"
        >
          +
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-iron px-4 pt-3 pb-4">{children}</div>
    </details>
  );
}
