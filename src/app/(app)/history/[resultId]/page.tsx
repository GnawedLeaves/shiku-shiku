import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionResultDetail } from "@/lib/supabase/database.types";
import BackButton from "@/components/ui/BackButton";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: result } = await supabase
    .from("session_results")
    .select("*")
    .eq("id", resultId)
    .eq("user_id", user.id)
    .single();

  if (!result) notFound();

  const details = (result.details ?? []) as SessionResultDetail[];
  const correct = details.filter((detail) => detail.result === "correct");
  const incorrect = details.filter((detail) => detail.result !== "correct");

  return (
    <div className="flex flex-col gap-4">
      <BackButton href="/history" label="History" />
      <div>
        <h1 className="text-xl font-bold">{result.set_name ?? "Deleted set"}</h1>
        <p className="text-sm opacity-60">
          {new Date(result.completed_at).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
      </div>

      <div className="stats stats-horizontal shadow-sm bg-base-100 w-full">
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

      {details.length === 0 && (
        <div className="alert">
          <span>No per-card breakdown was recorded for this session.</span>
        </div>
      )}

      {incorrect.length > 0 && (
        <DetailSection title="Got these wrong" tone="error" items={incorrect} />
      )}
      {correct.length > 0 && <DetailSection title="Got these right" tone="success" items={correct} />}

      {result.set_id && (
        <Link href={`/study/new?set=${result.set_id}`} className="btn btn-primary btn-sm self-start">
          Study this set again
        </Link>
      )}
    </div>
  );
}

function DetailSection({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "success" | "error";
  items: SessionResultDetail[];
}) {
  // Spelled out so Tailwind can see the class names.
  const toneClass = tone === "success" ? "text-success" : "text-error";

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body p-4 gap-2">
        <h2 className={`font-semibold text-sm ${toneClass}`}>
          {title} ({items.length})
        </h2>
        <ul className="flex flex-col divide-y divide-base-200">
          {items.map((item, i) => (
            <li key={`${item.card_id}-${i}`} className="flex items-start gap-2 py-2">
              <span aria-hidden="true">{tone === "success" ? "✓" : "✗"}</span>
              <div className="min-w-0">
                <p className="font-medium truncate">{item.question ?? "(card deleted)"}</p>
                <p className="text-sm opacity-70 truncate">
                  {[item.answer_hiragana, item.answer_romaji].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
