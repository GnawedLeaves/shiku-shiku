"use client";

import { useOptimistic, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { motion, type PanInfo } from "framer-motion";
import { recordSwipe, pauseSession } from "@/lib/actions/sessions";
import { formatAnswer } from "@/lib/study/formatAnswer";
import { computeScore } from "@/lib/study/score";
import type { AnswerDisplayMode, QueueEntry } from "@/lib/supabase/database.types";

interface CardData {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  answer_kanji: string | null;
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
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <h1 className="text-2xl font-bold">Session complete!</h1>
        {score && score.total > 0 && (
          <p className="text-lg">
            {score.correct} / {score.total} correct (
            {Math.round((score.correct / score.total) * 100)}%)
          </p>
        )}
        <div className="flex gap-2">
          <Link href="/history" className="btn btn-outline">
            See history
          </Link>
          <Link href="/study/new" className="btn btn-primary">
            Back to study
          </Link>
        </div>
      </div>
    );
  }

  if (!currentEntry) {
    return <p>No cards to study.</p>;
  }

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
          {optimistic.currentIndex + 1} / {optimistic.queue.length}
        </p>
        <form action={pauseSession.bind(null, sessionId)}>
          <button className="btn btn-ghost btn-xs">Pause &amp; exit</button>
        </form>
      </div>

      <progress
        className="progress progress-primary w-full"
        value={optimistic.currentIndex}
        max={optimistic.queue.length}
      />

      <div className="flex-1 min-h-0 flex flex-col">
        {currentEntry.type === "card" ? (
          <SwipeCard
            key={currentEntry.cardId}
            card={cardsById[currentEntry.cardId]}
            answerMode={answerMode}
            revealed={revealed.has(currentEntry.cardId)}
            onReveal={() => reveal(currentEntry.cardId)}
            onGrade={(result) => grade(currentEntry.cardId, result)}
          />
        ) : (
          <GroupBatch
            key={currentEntry.groupId}
            groupName={groupNamesById[currentEntry.groupId] ?? "Group"}
            cardIds={currentEntry.cardIds}
            statuses={currentEntry.statuses}
            cardsById={cardsById}
            answerMode={answerMode}
            revealed={revealed}
            onReveal={reveal}
            onGrade={grade}
          />
        )}
      </div>
    </div>
  );
}

function SwipeCard({
  card,
  answerMode,
  revealed,
  onReveal,
  onGrade,
}: {
  card: CardData;
  answerMode: AnswerDisplayMode;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (result: Result) => void;
}) {
  const [dragX, setDragX] = useState(0);

  function handleDragEnd(_: unknown, info: PanInfo) {
    setDragX(0);
    if (!revealed) return;
    if (info.offset.x > 100) onGrade("correct");
    else if (info.offset.x < -100) onGrade("incorrect");
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col items-center gap-4">
      <motion.div
        className="card w-full max-w-md flex-1 min-h-0 bg-base-100 shadow-xl select-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: "pan-y" }}
        drag={revealed ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDrag={(_, info) => setDragX(info.offset.x)}
        onDragEnd={handleDragEnd}
        animate={{ x: 0, rotate: 0 }}
        onClick={() => !revealed && onReveal()}
        whileTap={{ scale: revealed ? 1.02 : 0.98 }}
      >
        <div
          className="card-body h-full items-center text-center justify-center rounded-box transition-colors"
          style={{
            backgroundColor:
              dragX > 30
                ? "color-mix(in oklab, var(--color-success) 15%, transparent)"
                : dragX < -30
                  ? "color-mix(in oklab, var(--color-error) 15%, transparent)"
                  : undefined,
          }}
        >
          <p className="text-sm opacity-60 uppercase tracking-wide">Question</p>
          <h2 className="text-3xl font-bold px-2">{card.question}</h2>
          {revealed ? (
            <>
              <div className="divider my-2" />
              <p className="text-sm opacity-60 uppercase tracking-wide">Answer</p>
              <p className="text-2xl">{formatAnswer(card, answerMode)}</p>
              {card.answer_kanji && <p className="text-base opacity-60 mt-1">{card.answer_kanji}</p>}
            </>
          ) : (
            <p className="text-xs opacity-50 mt-2">Tap to reveal</p>
          )}
        </div>
      </motion.div>

      {revealed && (
        <>
          <div className="flex gap-6 shrink-0">
            <button
              className="btn btn-error btn-circle btn-lg text-2xl"
              onClick={() => onGrade("incorrect")}
              aria-label="Don't know"
            >
              ✗
            </button>
            <button
              className="btn btn-success btn-circle btn-lg text-2xl"
              onClick={() => onGrade("correct")}
              aria-label="Got it"
            >
              ✓
            </button>
          </div>
          <p className="text-xs opacity-50 shrink-0">
            Swipe right = got it, swipe left = don&apos;t know
          </p>
        </>
      )}
    </div>
  );
}

function GroupBatch({
  groupName,
  cardIds,
  statuses,
  cardsById,
  answerMode,
  revealed,
  onReveal,
  onGrade,
}: {
  groupName: string;
  cardIds: string[];
  statuses: Record<string, "pending" | Result>;
  cardsById: Record<string, CardData>;
  answerMode: AnswerDisplayMode;
  revealed: Set<string>;
  onReveal: (cardId: string) => void;
  onGrade: (cardId: string, result: Result) => void;
}) {
  const pendingIds = cardIds.filter((id) => statuses[id] === "pending");

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto">
      <h2 className="font-semibold">{groupName}</h2>
      <p className="text-xs opacity-60">Review each card in this group, then grade it.</p>
      {pendingIds.map((cardId) => {
        const card = cardsById[cardId];
        const isRevealed = revealed.has(cardId);
        return (
          <div key={cardId} className="card bg-base-100 shadow-sm">
            <div className="card-body p-4 gap-2">
              <p className="font-medium">{card.question}</p>
              {isRevealed ? (
                <>
                  <p className="text-sm opacity-70">{formatAnswer(card, answerMode)}</p>
                  <div className="flex gap-2 mt-1">
                    <button
                      className="btn btn-error btn-xs"
                      onClick={() => onGrade(cardId, "incorrect")}
                    >
                      Don&apos;t know
                    </button>
                    <button
                      className="btn btn-success btn-xs"
                      onClick={() => onGrade(cardId, "correct")}
                    >
                      Got it
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-outline btn-xs self-start"
                  onClick={() => onReveal(cardId)}
                >
                  Show answer
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
