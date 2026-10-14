"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatNumber, numberToHiragana, parseNumberAnswer } from "@/lib/numbers/japanese";
import { useJapaneseSpeech } from "@/lib/numbers/useJapaneseSpeech";

/** How the previous round ended, shown above the next one. */
export interface RoundFeedback {
  kind: "correct" | "skipped";
  number: number;
}

/**
 * One number: it's read out in Japanese, the player types it in. Unlimited
 * tries; Replay (or Enter on an empty box) hears it again; a hint reveals
 * the reading in hiragana; Skip moves on. Mount it with `key` set to the
 * round so each number starts fresh and is read out on arrival.
 */
export default function NumberRound({
  number,
  hintsLeft,
  feedback,
  onCorrect,
  onWrong,
  onSkip,
  onHint,
}: {
  number: number;
  hintsLeft: number;
  feedback: RoundFeedback | null;
  onCorrect: () => void;
  onWrong: () => void;
  onSkip: () => void;
  onHint: () => void;
}) {
  const { speak, speaking, support } = useJapaneseSpeech();
  const reduceMotion = useReducedMotion();
  const [answer, setAnswer] = useState("");
  const [misses, setMisses] = useState(0);
  const [hinted, setHinted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const spoken = useRef(false);

  // Read the number out once the voices are known (they load asynchronously).
  useEffect(() => {
    if (spoken.current || support === "checking") return;
    const id = window.setTimeout(() => {
      spoken.current = true;
      speak(number);
    }, 250);
    return () => window.clearTimeout(id);
  }, [support, speak, number]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function replay(slow = false) {
    speak(number, { slow });
    inputRef.current?.focus({ preventScroll: true });
  }

  function check(event: React.FormEvent) {
    event.preventDefault();
    if (!answer.trim()) {
      replay();
      return;
    }
    if (parseNumberAnswer(answer) === number) {
      onCorrect();
    } else {
      setMisses((n) => n + 1);
      setAnswer("");
      onWrong();
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  function hint() {
    if (hinted || hintsLeft <= 0) return;
    setHinted(true);
    onHint();
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <p className="min-h-5 text-sm" role="status" aria-live="polite">
        {feedback?.kind === "correct" && (
          <span className="text-success">✓ {formatNumber(feedback.number)} — correct!</span>
        )}
        {feedback?.kind === "skipped" && (
          <span className="opacity-70">
            Skipped: it was {formatNumber(feedback.number)} ({numberToHiragana(feedback.number)})
          </span>
        )}
      </p>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => replay()}
          aria-label="Play the number again"
          className={`grid h-24 w-24 place-items-center rounded-full border border-iron bg-iron text-concrete transition-transform active:scale-95 ${speaking ? "scale-105" : ""}`}
        >
          <SpeakerIcon />
        </button>
        <div className="flex gap-1">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => replay()}>
            Replay
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => replay(true)}>
            Slow
          </button>
        </div>
        {support === "unsupported" && (
          <p className="max-w-xs text-xs text-error">
            This browser can&apos;t read text aloud. Try Chrome, Safari or Edge.
          </p>
        )}
        {support === "no-japanese-voice" && (
          <p className="max-w-xs text-xs opacity-70">
            No Japanese voice found on this device, so it may not sound right. Add a Japanese voice
            in your system&apos;s speech settings.
          </p>
        )}
      </div>

      <div className="min-h-10">
        {hinted ? (
          <p className="text-[clamp(24px,7vw,34px)] leading-tight [overflow-wrap:anywhere]">
            {numberToHiragana(number)}
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={hint}
            disabled={hintsLeft <= 0}
          >
            Hint · {hintsLeft} left
          </button>
        )}
      </div>

      <motion.form
        onSubmit={check}
        className="flex w-full max-w-xs gap-2"
        key={misses}
        animate={misses > 0 && !reduceMotion ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
        transition={{ duration: 0.35 }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type the number"
          aria-label="The number you heard"
          className={`input input-bordered input-lg w-full min-w-0 text-center tabular-nums ${misses > 0 && !answer ? "input-error" : ""}`}
        />
        <button type="submit" className="btn btn-primary btn-lg">
          Check
        </button>
      </motion.form>
      <p className="min-h-4 text-xs opacity-60">
        {misses > 0
          ? `Not quite — ${misses === 1 ? "try again" : `${misses} tries so far`}.`
          : "Press Enter on an empty box to hear it again."}
      </p>

      <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}>
        Skip — I don&apos;t know
      </button>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path
        d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
