"use client";

import { useOptimistic, useRef, useState, startTransition } from "react";
import StudyDeck from "@/components/StudyDeck";
import { recordSwipe, pauseSession, restartSession } from "@/lib/actions/sessions";
import SubmitButton from "@/components/ui/SubmitButton";
import { computeScore } from "@/lib/study/score";
import type { AnswerDisplayMode, QueueEntry } from "@/lib/supabase/database.types";
import LinkButton from "@/components/ui/LinkButton";

interface CardData {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  answer_kanji: string | null;
  notes?: string | null;
}

type Result = "correct" | "incorrect";

interface SessionState {
  queue: QueueEntry[];
  currentIndex: number;
}

/** Applies a grade locally, exactly as `record_swipe` does on the server. */
function applyGrade(state: SessionState, cardId: string, result: Result): SessionState {
  const queue = state.queue.map((entry, index) => {
    if (index !== state.currentIndex) return entry;
    if (entry.type === "card") {
      return entry.cardId === cardId ? { ...entry, status: result } : entry;
    }
    if (!(cardId in entry.statuses)) return entry;
    return { ...entry, statuses: { ...entry.statuses, [cardId]: result } };
  });

  const entry = queue[state.currentIndex];
  const resolved =
    !entry ||
    (entry.type === "card"
      ? entry.status !== "pending"
      : Object.values(entry.statuses).every((status) => status !== "pending"));

  return { queue, currentIndex: resolved ? state.currentIndex + 1 : state.currentIndex };
}

/**
 * Progress in individual cards rather than queue entries, so a group batch of
 * eight cards counts as eight steps, not one. `position` is the card the user
 * is on now (1-based), so the bar reads full on the last card, matching the
 * "10 / 10" counter.
 */
function cardProgress(queue: QueueEntry[]): { position: number; total: number } {
  let graded = 0;
  let total = 0;
  for (const entry of queue) {
    const statuses = entry.type === "card" ? [entry.status] : Object.values(entry.statuses);
    total += statuses.length;
    graded += statuses.filter((status) => status !== "pending").length;
  }
  return { position: Math.min(graded + 1, total), total };
}

export default function SwipeSession({
  sessionId,
  initialQueue,
  initialIndex,
  cardsById,
  groupNamesById,
  answerMode,
  initialScore,
}: {
  sessionId: string;
  initialQueue: QueueEntry[];
  initialIndex: number;
  cardsById: Record<string, CardData>;
  groupNamesById: Record<string, string>;
  answerMode: AnswerDisplayMode;
  initialScore: { correct: number; total: number } | null;
}) {
  // `state` is what the server has confirmed; `optimistic` is what the user
  // sees. The next card appears on the same frame as the tap -- the write to
  // Supabase happens in the background inside the transition.
  const [state, setState] = useState<SessionState>({
    queue: initialQueue,
    currentIndex: initialIndex,
  });
  const [optimistic, applyOptimistic] = useOptimistic(
    state,
    (current: SessionState, action: { cardId: string; result: Result }) =>
      applyGrade(current, action.cardId, action.result)
  );

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Grades are queued so rapid taps can't race each other to the server.
  const pendingWrites = useRef<Promise<unknown>>(Promise.resolve());

  const isComplete = optimistic.currentIndex >= optimistic.queue.length;
  const currentEntry = optimistic.queue[optimistic.currentIndex];
  const score = isComplete ? computeScore(optimistic.queue) : initialScore;

  function reveal(cardId: string) {
    setRevealed((prev) => new Set(prev).add(cardId));
  }

  function grade(cardId: string, result: Result) {
    startTransition(async () => {
      applyOptimistic({ cardId, result });
      setRevealed(new Set());

      const write = pendingWrites.current.then(() => recordSwipe(sessionId, cardId, result));
      pendingWrites.current = write.catch(() => undefined);

      try {
        const confirmed = await write;
        startTransition(() => {
          setState({ queue: confirmed.queue, currentIndex: confirmed.currentIndex });
        });
      } catch (e) {
        // The optimistic grade rolls back on its own when the transition ends.
        setError(e instanceof Error ? e.message : "Couldn't save that answer");
      }
    });
  }

  if (isComplete) {
    const cardCount = optimistic.queue.reduce(
      (total, entry) => total + (entry.type === "card" ? 1 : entry.cardIds.length),
      0
    );
    return (
      <div className="flex flex-col gap-6 py-8">
        <h1 className="display">Done.</h1>
        <hr className="hairline" />
        {score && score.total > 0 && (
          <p className="text-subheading">
            {score.correct} / {score.total} correct —{" "}
            {Math.round((score.correct / score.total) * 100)}%
          </p>
        )}
        <form action={restartSession.bind(null, sessionId)} className="flex items-center gap-2">
          <span className="text-body-sm">Again?</span>
          <SubmitButton className="btn btn-primary" pendingText="Restarting…">
            {cardCount === 1 ? "Restart this card" : `Restart these ${cardCount} cards`}
          </SubmitButton>
        </form>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/history" className="btn btn-outline">
            See history
          </LinkButton>
          <LinkButton href="/study/new" className="btn btn-outline">
            Back to study
          </LinkButton>
        </div>
      </div>
    );
  }

  if (!currentEntry) {
    return <p>No cards to study.</p>;
  }

  const progress = cardProgress(optimistic.queue);
  // A group entry is studied one card at a time on the same deck, in order.
  const currentCardId =
    currentEntry.type === "card"
      ? currentEntry.cardId
      : (currentEntry.cardIds.find((id) => currentEntry.statuses[id] === "pending") ??
        currentEntry.cardIds[0]);

  return (
    // `h-full` lets the card below fill the space between the header and the
    // bottom nav (main is a flex-1 sibling in the app shell, so it already
    // has a real resolved height, not just its content's height) instead of
    // sitting at whatever size its content naturally wants, which is what
    // kept it pinned near the top with room to spare underneath.
    <div className="flex flex-col gap-3 h-full min-h-140">
      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm opacity-60">
          {progress.position} / {progress.total}
          {currentEntry.type === "group" && (
            <> · {groupNamesById[currentEntry.groupId] ?? "Group"}</>
          )}
        </p>
        <form action={pauseSession.bind(null, sessionId)}>
          <SubmitButton className="btn btn-ghost btn-xs" pendingText="Pausing…">
            Pause &amp; exit
          </SubmitButton>
        </form>
      </div>

      <progress
        className="progress progress-primary w-full"
        value={progress.position}
        max={progress.total}
      />

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Deliberately not keyed by card: the deck stays mounted so the graded
            card can animate away while the next one rises off the stack. */}
        <StudyDeck
          card={cardsById[currentCardId]}
          answerMode={answerMode}
          revealed={revealed.has(currentCardId)}
          cardsBehind={progress.total - progress.position}
          onReveal={() => reveal(currentCardId)}
          onGrade={(result) => grade(currentCardId, result)}
        />
      </div>
    </div>
  );
}
