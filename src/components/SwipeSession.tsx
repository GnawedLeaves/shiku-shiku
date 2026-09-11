"use client";

import { useState } from "react";
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
  const [queue, setQueue] = useState(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [isComplete, setIsComplete] = useState(initialIndex >= initialQueue.length);
  const [score, setScore] = useState(initialScore);
  const [isBusy, setIsBusy] = useState(false);

  const currentEntry = queue[currentIndex];

  function reveal(cardId: string) {
    setRevealed((prev) => new Set(prev).add(cardId));
  }

  async function grade(cardId: string, result: Result) {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await recordSwipe(sessionId, cardId, result);
      setQueue(res.queue);
      setCurrentIndex(res.currentIndex);
      setRevealed(new Set());
      if (res.isComplete) {
        setScore(computeScore(res.queue));
        setIsComplete(true);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePause() {
    await pauseSession(sessionId);
  }

  if (isComplete) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <h1 className="text-2xl font-bold">Session complete!</h1>
        {score && score.total > 0 && (
          <p className="text-lg">
            {score.correct} / {score.total} correct ({Math.round((score.correct / score.total) * 100)}%)
          </p>
        )}
        <Link href="/study/new" className="btn btn-primary">
          Back to study
        </Link>
      </div>
    );
  }

  if (!currentEntry) {
    return <p>No cards to study.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm opacity-60">
          {currentIndex + 1} / {queue.length}
        </p>
        <button className="btn btn-ghost btn-xs" onClick={handlePause}>
          Pause &amp; exit
        </button>
      </div>

      {currentEntry.type === "card" ? (
        <SwipeCard
          key={currentEntry.cardId}
          card={cardsById[currentEntry.cardId]}
          answerMode={answerMode}
          revealed={revealed.has(currentEntry.cardId)}
          onReveal={() => reveal(currentEntry.cardId)}
          onGrade={(result) => grade(currentEntry.cardId, result)}
          disabled={isBusy}
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
          disabled={isBusy}
        />
      )}
    </div>
  );
}

function SwipeCard({
  card,
  answerMode,
  revealed,
  onReveal,
  onGrade,
  disabled,
}: {
  card: CardData;
  answerMode: AnswerDisplayMode;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (result: Result) => void;
  disabled: boolean;
}) {
  const [dragX, setDragX] = useState(0);

  function handleDragEnd(_: unknown, info: PanInfo) {
    setDragX(0);
    if (!revealed) return;
    if (info.offset.x > 100) onGrade("correct");
    else if (info.offset.x < -100) onGrade("incorrect");
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        className="card w-full max-w-sm bg-base-100 shadow-xl select-none cursor-grab active:cursor-grabbing"
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
          className="card-body items-center text-center min-h-56 justify-center rounded-box transition-colors"
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
          <h2 className="text-2xl font-bold">{card.question}</h2>
          {revealed ? (
            <>
              <div className="divider my-1" />
              <p className="text-sm opacity-60 uppercase tracking-wide">Answer</p>
              <p className="text-xl">{formatAnswer(card, answerMode)}</p>
              {card.answer_kanji && <p className="text-sm opacity-60">{card.answer_kanji}</p>}
            </>
          ) : (
            <p className="text-xs opacity-50 mt-2">Tap to reveal</p>
          )}
        </div>
      </motion.div>

      {revealed && (
        <>
          <div className="flex gap-4">
            <button
              className="btn btn-error btn-circle"
              disabled={disabled}
              onClick={() => onGrade("incorrect")}
            >
              ✗
            </button>
            <button
              className="btn btn-success btn-circle"
              disabled={disabled}
              onClick={() => onGrade("correct")}
            >
              ✓
            </button>
          </div>
          <p className="text-xs opacity-50">Swipe right = got it, swipe left = don&apos;t know</p>
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
  disabled,
}: {
  groupName: string;
  cardIds: string[];
  statuses: Record<string, "pending" | Result>;
  cardsById: Record<string, CardData>;
  answerMode: AnswerDisplayMode;
  revealed: Set<string>;
  onReveal: (cardId: string) => void;
  onGrade: (cardId: string, result: Result) => void;
  disabled: boolean;
}) {
  const pendingIds = cardIds.filter((id) => statuses[id] === "pending");

  return (
    <div className="flex flex-col gap-3">
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
                      disabled={disabled}
                      onClick={() => onGrade(cardId, "incorrect")}
                    >
                      Don&apos;t know
                    </button>
                    <button
                      className="btn btn-success btn-xs"
                      disabled={disabled}
                      onClick={() => onGrade(cardId, "correct")}
                    >
                      Got it
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn btn-outline btn-xs self-start" onClick={() => onReveal(cardId)}>
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
