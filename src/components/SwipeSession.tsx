"use client";

import { useOptimistic, useRef, useState, startTransition } from "react";
import StudyDeck from "@/components/StudyDeck";
import { recordSwipe, pauseSession, restartSession } from "@/lib/actions/sessions";
import SubmitButton from "@/components/ui/SubmitButton";
import { computeScore } from "@/lib/study/score";
import type { AnswerDisplayMode, QueueEntry, StudyMode } from "@/lib/supabase/database.types";
import {
  applyGrade,
  cardMisses,
  countMisses,
  pickRequeuePosition,
  type Result,
  type SessionState,
} from "@/lib/study/applyGrade";
import LinkButton from "@/components/ui/LinkButton";

interface CardData {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  answer_kanji: string | null;
  notes?: string | null;
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
  studyMode,
  initialScore,
}: {
  sessionId: string;
  initialQueue: QueueEntry[];
  initialIndex: number;
  cardsById: Record<string, CardData>;
  groupNamesById: Record<string, string>;
  answerMode: AnswerDisplayMode;
  studyMode: StudyMode;
  initialScore: { correct: number; total: number } | null;
}) {
  // `state` is what the server has confirmed; `optimistic` is what the user
  // sees. The next card appears on the same frame as the tap -- the write to
  // Supabase happens in the background inside the transition.
  const flashcards = studyMode === "flashcards";
  const [state, setState] = useState<SessionState>({
    queue: initialQueue,
    currentIndex: initialIndex,
  });
  const [optimistic, applyOptimistic] = useOptimistic(
    state,
    (current: SessionState, action: { cardId: string; result: Result; requeuePosition?: number }) =>
      applyGrade(current, action.cardId, action.result, {
        flashcards,
        requeuePosition: action.requeuePosition,
      })
  );

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Grades are queued so rapid taps can't race each other to the server.
  const pendingWrites = useRef<Promise<unknown>>(Promise.resolve());

  const isComplete = optimistic.currentIndex >= optimistic.queue.length;
  const currentEntry = optimistic.queue[optimistic.currentIndex];
  const score = isComplete ? computeScore(optimistic.queue) : initialScore;
  const misses = countMisses(optimistic.queue);

  function reveal(cardId: string) {
    setRevealed((prev) => new Set(prev).add(cardId));
  }

  function grade(cardId: string, result: Result) {
    // Chosen here and sent along, so the server puts a missed card back in the
    // same place the user already sees it go.
    const requeuePosition =
      flashcards && result === "incorrect" ? pickRequeuePosition(optimistic, cardId) : undefined;

    startTransition(async () => {
      applyOptimistic({ cardId, result, requeuePosition });
      setRevealed(new Set());

      const write = pendingWrites.current.then(() =>
        recordSwipe(sessionId, cardId, result, requeuePosition)
      );
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
        {flashcards ? (
          <p className="text-subheading">
            Cleared all {cardCount} card{cardCount === 1 ? "" : "s"} — pressed &ldquo;don&apos;t
            know&rdquo; {misses} time{misses === 1 ? "" : "s"}
          </p>
        ) : (
          score &&
          score.total > 0 && (
            <p className="text-subheading">
              {score.correct} / {score.total} correct —{" "}
              {Math.round((score.correct / score.total) * 100)}%
            </p>
          )
        )}
        {cardCount > 0 && (
          <form action={restartSession.bind(null, sessionId)} className="flex items-center gap-2">
            <span className="text-body-sm">Again?</span>
            <SubmitButton className="btn btn-primary" pendingText="Restarting…">
              {cardCount === 1 ? "Restart this card" : `Restart these ${cardCount} cards`}
            </SubmitButton>
          </form>
        )}
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
          {flashcards && <> · Don&apos;t know: {misses}</>}
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
          // A missed card can come straight back (the last one left); a new
          // key per miss still lets it animate out and back in.
          cardKey={`${currentCardId}:${cardMisses(currentEntry, currentCardId)}`}
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
