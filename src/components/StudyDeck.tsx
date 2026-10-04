"use client";

import { useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
  type Variants,
} from "framer-motion";
import { formatAnswer } from "@/lib/study/formatAnswer";
import { REMARKS_PREVIEW_LENGTH } from "@/lib/study/remarks";
import type { AnswerDisplayMode } from "@/lib/supabase/database.types";

export interface DeckCard {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  answer_kanji: string | null;
  notes?: string | null;
}

type Result = "correct" | "incorrect";

/** Vertical gap between the paper edges of the stack under the current card. */
const LAYER_OFFSET = 3;
const MAX_LAYERS = 16;
/** A drag past this distance (or a fast flick) grades the card. */
const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 500;

/**
 * How many paper edges to draw for `behind` cards still to come. Grows with
 * the square root so 100 cards reads clearly thicker than 50 without the stack
 * swallowing the screen, and thins out one-per-card near the end.
 */
function stackLayers(behind: number): number {
  if (behind <= 0) return 0;
  return Math.min(behind, MAX_LAYERS, Math.ceil(Math.sqrt(behind) * 1.6));
}

/** The transform of the paper edge `depth` cards down the stack. */
function layerTransform(depth: number) {
  return { y: depth * LAYER_OFFSET, scale: 1 - depth * 0.004 };
}

const cardVariants: Variants = {
  // New cards start where the top of the stack sits, then rise into place.
  enter: { ...layerTransform(1), opacity: 1, zIndex: 1 },
  center: {
    y: 0,
    scale: 1,
    opacity: 1,
    zIndex: 1,
    transition: { type: "spring", stiffness: 380, damping: 32 },
  },
  // `direction` is 1 for "got it" (fly right) and -1 for "don't know" (left).
  exit: (direction: number) => ({
    x: direction * 520,
    opacity: 0,
    zIndex: 2,
    transition: { duration: 0.32, ease: [0.4, 0, 1, 1] },
  }),
};

/**
 * One card of a study session on top of a deck: tap (or "Reveal") flips it in
 * 3D to the answer, then swipe or press a button to throw it left/right while
 * the next card rises off the stack. The stack's thickness follows how many
 * cards are left.
 */
export default function StudyDeck({
  card,
  cardKey,
  answerMode,
  revealed,
  cardsBehind,
  onReveal,
  onGrade,
}: {
  card: DeckCard;
  /** Identity for the deck animation; defaults to the card id. */
  cardKey?: string;
  answerMode: AnswerDisplayMode;
  revealed: boolean;
  /** Cards still to come after this one. */
  cardsBehind: number;
  onReveal: () => void;
  onGrade: (result: Result) => void;
}) {
  const [direction, setDirection] = useState<1 | -1>(1);
  const layers = stackLayers(cardsBehind);

  function grade(result: Result) {
    setDirection(result === "correct" ? 1 : -1);
    onGrade(result);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex w-full flex-1 min-h-0 flex-col items-center gap-4">
        {/* Room below the card for the stack's full height, so the card doesn't
            resize as the deck runs down. */}
        <div
          className="relative w-full max-w-md flex-1 min-h-0"
          style={{ marginBottom: MAX_LAYERS * LAYER_OFFSET }}
        >
          {Array.from({ length: layers }, (_, i) => {
            const depth = layers - i; // deepest first, so shallower ones paint on top
            const { y, scale } = layerTransform(depth);
            return (
              <div
                key={depth}
                aria-hidden="true"
                className="absolute inset-0 border border-iron bg-concrete transition-transform duration-300"
                style={{ transform: `translateY(${y}px) scale(${scale})`, transformOrigin: "50% 100%" }}
              />
            );
          })}

          <AnimatePresence custom={direction} initial={false}>
            <FlipCard
              key={cardKey ?? card.id}
              card={card}
              answerMode={answerMode}
              revealed={revealed}
              direction={direction}
              onReveal={onReveal}
              onGrade={grade}
            />
          </AnimatePresence>
        </div>

        <div className="flex w-full max-w-md gap-2 shrink-0">
          {revealed ? (
            <>
              <button className="btn btn-outline flex-1" onClick={() => grade("incorrect")}>
                Don&apos;t know
              </button>
              <button className="btn btn-primary flex-1" onClick={() => grade("correct")}>
                Got it
              </button>
            </>
          ) : (
            <button className="btn btn-primary flex-1" onClick={onReveal}>
              Reveal answer
            </button>
          )}
        </div>
        <p className="text-xs opacity-50 shrink-0">
          {revealed
            ? "Swipe right = got it, swipe left = don't know"
            : "Tap the card to flip it"}
        </p>
      </div>
    </MotionConfig>
  );
}

function FlipCard({
  card,
  answerMode,
  revealed,
  direction,
  onReveal,
  onGrade,
}: {
  card: DeckCard;
  answerMode: AnswerDisplayMode;
  revealed: boolean;
  direction: 1 | -1;
  onReveal: () => void;
  onGrade: (result: Result) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-14, 14]);
  const gotItTint = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
  const dontKnowTint = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onGrade("correct");
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY)
      onGrade("incorrect");
  }

  return (
    <motion.div
      className="absolute inset-0 select-none cursor-grab active:cursor-grabbing"
      style={{ x, rotate, touchAction: "pan-y" }}
      custom={direction}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      drag={revealed ? "x" : false}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      onTap={() => !revealed && onReveal()}
    >
      <div className="h-full" style={{ perspective: 1400 }}>
        <motion.div
          className="relative h-full"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.3, 0.7, 0.2, 1] }}
        >
          {/* Front: the question */}
          <CardFace>
            <p className="text-xs opacity-60">Question</p>
            <div className="flex flex-1 items-center justify-center">
              <h2 className="text-center text-[clamp(32px,11vw,60px)] leading-[0.9] [overflow-wrap:anywhere]">
                {card.question}
              </h2>
            </div>
            <p className="text-xs opacity-50 text-center">Tap to flip</p>
          </CardFace>

          {/* Back: the answer, plus remarks */}
          <CardFace back>
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: gotItTint,
                backgroundColor: "color-mix(in oklab, var(--color-success) 16%, transparent)",
              }}
            />
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: dontKnowTint,
                backgroundColor: "color-mix(in oklab, var(--color-error) 16%, transparent)",
              }}
            />

            <p className="relative text-body-sm opacity-60 break-words">{card.question}</p>
            <div className="relative flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
              <p className="text-xs opacity-60">Answer</p>
              <p className="text-[clamp(22px,7vw,34px)] leading-tight tracking-tight [overflow-wrap:anywhere]">
                {formatAnswer(card, answerMode)}
              </p>
              {card.answer_kanji && <p className="text-body-sm opacity-70">{card.answer_kanji}</p>}
            </div>
            {card.notes && (
              <div className="relative">
                <Remarks text={card.notes} />
              </div>
            )}
          </CardFace>
        </motion.div>
      </div>
    </motion.div>
  );
}

function CardFace({ back = false, children }: { back?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col gap-2 overflow-y-auto border border-iron bg-concrete p-5"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A card's remarks, collapsed to a preview behind "Show more" when long. The
 * toggle stops pointer events so tapping it never starts a swipe.
 */
export function Remarks({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > REMARKS_PREVIEW_LENGTH;
  const shown =
    isLong && !expanded ? `${text.slice(0, REMARKS_PREVIEW_LENGTH).trimEnd()}…` : text;

  return (
    <div className="w-full border-t border-iron pt-3 text-left">
      <p className="text-xs opacity-60 mb-1">Remarks</p>
      <p className="text-sm leading-snug whitespace-pre-line break-words">{shown}</p>
      {isLong && (
        <button
          type="button"
          className="btn btn-ghost btn-xs mt-1 -ml-2 gap-1"
          aria-expanded={expanded}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Show less" : "Show more"}
          <span
            aria-hidden="true"
            className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
      )}
    </div>
  );
}
