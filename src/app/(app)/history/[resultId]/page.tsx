import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionResultDetail } from "@/lib/supabase/database.types";
import BackButton from "@/components/ui/BackButton";
import SubmitButton from "@/components/ui/SubmitButton";
import { restartFromResult } from "@/lib/actions/sessions";
import LinkButton from "@/components/ui/LinkButton";
import { getCurrentUser } from "@/lib/supabase/auth";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: result } = await supabase
    .from("session_results")
    .select("*")
    .eq("id", resultId)
    .eq("user_id", user.id)
    .single();

  if (!result) notFound();

  const { data: session } = result.session_id
    ? await supabase.from("study_sessions").select("name").eq("id", result.session_id).maybeSingle()
    : { data: null };
  const setName = result.set_name ?? "Deleted set";

  const details = (result.details ?? []) as SessionResultDetail[];
  const flashcards = result.study_mode === "flashcards";
  const correct = details.filter((detail) => detail.result === "correct");
  const incorrect = details.filter((detail) => detail.result !== "correct");
  // Flashcards: every card was eventually cleared, so split by whether it
  // took more than one go -- hardest first.
  const missed = details
    .filter((detail) => (detail.misses ?? 0) > 0)
    .sort((a, b) => (b.misses ?? 0) - (a.misses ?? 0));
  const firstTry = details.filter((detail) => !detail.misses);

  return (
    <div className="flex flex-col gap-4">
      <BackButton href="/history" label="History" />
      {/* Session name > set name > date. Unnamed sessions use the set name as the title. */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold break-words">{session?.name || setName}</h1>
        {session?.name && <p className="text-subheading opacity-70 break-words">{setName}</p>}
        <p className="text-sm opacity-60">
          {new Date(result.completed_at).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
      </div>

      {flashcards ? (
        <div className="stats stats-horizontal bg-base-100 w-full">
          <div className="stat p-3">
            <div className="stat-title text-xs">Flashcards</div>
            <div className="stat-value text-2xl">{result.total_count}</div>
            <div className="stat-desc">cards cleared</div>
          </div>
          <div className="stat p-3">
            <div className="stat-title text-xs">Don&apos;t know</div>
            <div className="stat-value text-2xl text-error">{result.dont_know_count}</div>
            <div className="stat-desc">times pressed</div>
          </div>
          <div className="stat p-3">
            <div className="stat-title text-xs">First try</div>
            <div className="stat-value text-2xl text-success">{firstTry.length}</div>
          </div>
        </div>
      ) : (
        <div className="stats stats-horizontal bg-base-100 w-full">
          <div className="stat p-3">
            <div className="stat-title text-xs">Score</div>
            <div className="stat-value text-2xl">{Math.round(result.score_percentage)}%</div>
            <div className="stat-desc">
              {result.correct_count}/{result.total_count}
            </div>
          </div>
          <div className="stat p-3">
            <div className="stat-title text-xs">Right</div>
            <div className="stat-value text-2xl text-success">{correct.length}</div>
          </div>
          <div className="stat p-3">
            <div className="stat-title text-xs">Wrong</div>
            <div className="stat-value text-2xl text-error">{incorrect.length}</div>
          </div>
        </div>
      )}

      {details.length === 0 && (
        <div className="alert">
          <span>No per-card breakdown was recorded for this session.</span>
        </div>
      )}

      {flashcards ? (
        <>
          {missed.length > 0 && (
            <DetailSection title="Needed more goes" tone="error" items={missed} showMisses />
          )}
          {firstTry.length > 0 && (
            <DetailSection title="Knew first time" tone="success" items={firstTry} />
          )}
        </>
      ) : (
        <>
          {incorrect.length > 0 && (
            <DetailSection title="Got these wrong" tone="error" items={incorrect} />
          )}
          {correct.length > 0 && (
            <DetailSection title="Got these right" tone="success" items={correct} />
          )}
        </>
      )}

      <div className="flex flex-col gap-2 border-t border-iron pt-4">
        {details.length > 0 && (
          <form
            action={restartFromResult.bind(null, resultId)}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-body-sm">Same words again?</span>
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Starting…">
              {details.length === 1 ? "Restart this card" : `Restart these ${details.length} cards`}
            </SubmitButton>
          </form>
        )}
        {result.set_id && (
          <LinkButton
            href={`/study/new?set=${result.set_id}`}
            className="btn btn-outline btn-sm self-start"
          >
            Study this set again
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function DetailSection({
  title,
  tone,
  items,
  showMisses = false,
}: {
  title: string;
  tone: "success" | "error";
  items: SessionResultDetail[];
  /** Show how many times "don't know" was pressed on each card. */
  showMisses?: boolean;
}) {
  // Spelled out so Tailwind can see the class names.
  const toneClass = tone === "success" ? "text-success" : "text-error";

  return (
    <div className="card bg-base-100">
      <div className="card-body p-4 gap-2">
        <h2 className={`font-semibold text-sm ${toneClass}`}>
          {title} ({items.length})
        </h2>
        <ul className="flex flex-col divide-y divide-base-200">
          {items.map((item, i) => (
            <li key={`${item.card_id}-${i}`} className="flex items-start gap-2 py-2">
              <span aria-hidden="true">{tone === "success" ? "✓" : "✗"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{item.question ?? "(card deleted)"}</p>
                <p className="text-sm opacity-70 truncate">
                  {[item.answer_hiragana, item.answer_romaji].filter(Boolean).join(" · ")}
                </p>
              </div>
              {showMisses && (
                <span className="badge badge-sm badge-outline shrink-0">
                  ×{item.misses ?? 0}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
