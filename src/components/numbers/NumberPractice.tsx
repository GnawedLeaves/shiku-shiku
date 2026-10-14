"use client";

import { useEffect, useMemo, useState } from "react";
import NumberRound, { type RoundFeedback } from "@/components/numbers/NumberRound";
import NumberOptionsPicker, {
  describeNumberOptions,
} from "@/components/numbers/NumberOptionsPicker";
import {
  DEFAULT_NUMBER_OPTIONS,
  formatNumber,
  NumberPool,
  numberToHiragana,
  randomSeed,
  type NumberOptions,
  type PoolPosition,
} from "@/lib/numbers/japanese";
import { formatStudyTime } from "@/lib/study/useStudyTimer";
import { saveNumberPractice } from "@/lib/actions/numbers";

interface Run extends PoolPosition {
  seed: number;
  hintsUsed: number;
  wrongAttempts: number;
  skippedNumbers: number[];
  startedAt: number;
  finishedAt: number | null;
  feedback: RoundFeedback | null;
}

const newRun = (): Run => ({
  seed: randomSeed(),
  correct: 0,
  skips: 0,
  skipsThisRound: 0,
  hintsUsed: 0,
  wrongAttempts: 0,
  skippedNumbers: [],
  startedAt: Date.now(),
  finishedAt: null,
  feedback: null,
});

/** Seconds since `since`, ticking while `running`. */
function useSeconds(since: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** Single-player number listening: settings, the run, then the results. */
export default function NumberPractice({
  header,
}: {
  /** The page's title and tabs: shown before and after a run, not during. */
  header?: React.ReactNode;
}) {
  const [options, setOptions] = useState<NumberOptions>(DEFAULT_NUMBER_OPTIONS);
  const [run, setRun] = useState<Run | null>(null);

  if (!run) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <NumberOptionsPicker value={options} onChange={setOptions} />
        <button
          type="button"
          className="btn btn-primary btn-lg w-full max-w-xs self-center"
          onClick={() => setRun(newRun())}
        >
          Start
        </button>
      </div>
    );
  }

  if (run.finishedAt) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <PracticeResults
          options={options}
          run={run}
          onAgain={() => setRun(newRun())}
          onSettings={() => setRun(null)}
        />
      </div>
    );
  }

  return <PracticeRun options={options} run={run} setRun={setRun} onQuit={() => setRun(null)} />;
}

function PracticeRun({
  options,
  run,
  setRun,
  onQuit,
}: {
  options: NumberOptions;
  run: Run;
  setRun: (run: Run) => void;
  onQuit: () => void;
}) {
  const seconds = useSeconds(run.startedAt, true);
  // Same rules as a battle: a set of different numbers, and skips swap in
  // spares from outside that set.
  const pool = useMemo(() => new NumberPool(run.seed, options), [run.seed, options]);
  const number = pool.current(run);

  function correct() {
    const done = run.correct + 1 >= options.rounds;
    const next: Run = {
      ...run,
      correct: run.correct + 1,
      skipsThisRound: 0,
      feedback: { kind: "correct", number },
      finishedAt: done ? Date.now() : null,
    };
    setRun(next);
    if (done) {
      // Saved in the background; the results show straight away.
      saveNumberPractice(options, {
        correct: next.correct,
        skips: next.skips,
        hintsUsed: next.hintsUsed,
        wrongAttempts: next.wrongAttempts,
        skippedNumbers: next.skippedNumbers,
        durationSeconds: Math.round((next.finishedAt! - next.startedAt) / 1000),
      }).catch(() => undefined);
    }
  }

  return (
    // No fixed height: the round sits right under the progress bar, so both
    // stay in view above the on-screen keyboard.
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading tabular-nums" aria-label="Time">
          {formatStudyTime(seconds)}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => window.confirm("End this practice? It won't be saved.") && onQuit()}
        >
          End
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs opacity-70 tabular-nums">
          <span>
            {run.correct} / {options.rounds} correct
          </span>
          <span>
            {run.skips} skipped · {run.hintsUsed} hint{run.hintsUsed === 1 ? "" : "s"} used
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={options.rounds}
          aria-valuenow={run.correct}
          className="h-3 w-full border border-iron"
        >
          <div
            className="h-full bg-iron transition-[width] duration-300"
            style={{ width: `${(run.correct / options.rounds) * 100}%` }}
          />
        </div>
      </div>

      <NumberRound
        key={`${run.correct}:${run.skips}`}
        number={number}
        hintsLeft={options.hints - run.hintsUsed}
        feedback={run.feedback}
        onCorrect={correct}
        onWrong={() => setRun({ ...run, wrongAttempts: run.wrongAttempts + 1 })}
        onHint={() => setRun({ ...run, hintsUsed: run.hintsUsed + 1 })}
        onSkip={() =>
          setRun({
            ...run,
            skips: run.skips + 1,
            skipsThisRound: run.skipsThisRound + 1,
            skippedNumbers: [...run.skippedNumbers, number],
            feedback: { kind: "skipped", number },
          })
        }
      />
    </div>
  );
}

function PracticeResults({
  options,
  run,
  onAgain,
  onSettings,
}: {
  options: NumberOptions;
  run: Run;
  onAgain: () => void;
  onSettings: () => void;
}) {
  const seconds = Math.round(((run.finishedAt ?? run.startedAt) - run.startedAt) / 1000);
  const skipped = Array.from(new Set(run.skippedNumbers));

  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="display">Done.</h1>
      <hr className="hairline" />
      <p className="text-subheading">
        {options.rounds} numbers in {formatStudyTime(seconds)}.
      </p>
      <p className="text-sm opacity-70">{describeNumberOptions(options)}</p>

      <dl className="grid grid-cols-3 border-t border-iron">
        {(
          [
            ["Skipped", run.skips],
            ["Wrong tries", run.wrongAttempts],
            ["Hints used", run.hintsUsed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 border-b border-iron py-3">
            <dt className="text-xs opacity-60">{label}</dt>
            <dd className="text-subheading tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {skipped.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-subheading">Numbers you skipped</h2>
          <ul className="flex flex-col border-t border-iron">
            {skipped.map((n) => (
              <li key={n} className="flex items-baseline justify-between gap-3 border-b border-iron py-2">
                <span className="text-body-sm tabular-nums">{formatNumber(n)}</span>
                <span className="text-sm opacity-70 [overflow-wrap:anywhere]">
                  {numberToHiragana(n)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          Play again
        </button>
        <button type="button" className="btn btn-outline" onClick={onSettings}>
          Change settings
        </button>
      </div>
    </div>
  );
}
