"use client";

import { useState } from "react";
import {
  MAX_NUMBER,
  cleanNumberOptions,
  formatNumber,
  type NumberOptions,
} from "@/lib/numbers/japanese";

const RANGE_PRESETS: [number, number][] = [
  [1, 10],
  [1, 100],
  [100, 1000],
  [1000, 10000],
  [10000, 1000000],
];
const ROUND_PRESETS = [10, 20, 50] as const;

export function describeNumberOptions(options: NumberOptions): string {
  return `${formatNumber(options.min)}–${formatNumber(options.max)} · ${options.rounds} to get right · ${options.hints} hint${options.hints === 1 ? "" : "s"} each`;
}

/**
 * A number field that keeps what you type to itself until you're done
 * (blur or Enter), then hands the number up.
 */
function NumberField({
  value,
  onCommit,
  label,
  min = 0,
  max = MAX_NUMBER,
  className = "",
  disabled,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
}) {
  // null = not editing: show the saved value.
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const n = Math.floor(Number(draft.replace(/[,\s]/g, "")));
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(n) && n !== value) onCommit(n);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      min={min}
      max={max}
      disabled={disabled}
      className={`input input-bordered input-sm tabular-nums ${className}`}
    />
  );
}

/**
 * Number listening settings: which numbers, how many to get right, and how
 * many hints each player gets. Every change is handed up already cleaned.
 */
export default function NumberOptionsPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: NumberOptions;
  onChange: (next: NumberOptions) => void;
  disabled?: boolean;
}) {
  const [customRounds, setCustomRounds] = useState(
    !ROUND_PRESETS.includes(value.rounds as 10 | 20 | 50)
  );
  const change = (patch: Partial<NumberOptions>) =>
    onChange(cleanNumberOptions({ ...value, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="label-text">Numbers from</span>
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map(([min, max]) => {
            const active = value.min === min && value.max === max;
            return (
              <button
                key={`${min}-${max}`}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => change({ min, max })}
                className={`btn btn-sm ${active ? "btn-primary" : "btn-outline"}`}
              >
                {formatNumber(min)}–{formatNumber(max)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <NumberField
            label="Lowest number"
            value={value.min}
            onCommit={(min) => change({ min })}
            className="w-32"
            disabled={disabled}
          />
          <span className="opacity-60">to</span>
          <NumberField
            label="Highest number"
            value={value.max}
            onCommit={(max) => change({ max })}
            className="w-32"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-text">How many to get right?</span>
        <div className="flex flex-wrap items-center gap-2">
          {ROUND_PRESETS.map((rounds) => {
            const active = !customRounds && value.rounds === rounds;
            return (
              <button
                key={rounds}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  setCustomRounds(false);
                  change({ rounds });
                }}
                className={`btn btn-sm ${active ? "btn-primary" : "btn-outline"}`}
              >
                {rounds}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customRounds}
            disabled={disabled}
            onClick={() => setCustomRounds(true)}
            className={`btn btn-sm ${customRounds ? "btn-primary" : "btn-outline"}`}
          >
            Custom
          </button>
          {customRounds && (
            <NumberField
              label="Custom number of rounds"
              value={value.rounds}
              min={1}
              max={500}
              onCommit={(rounds) => change({ rounds })}
              className="w-20"
              disabled={disabled}
            />
          )}
        </div>
        <p className="text-xs opacity-60">Skipped numbers don&apos;t count — a new one comes up.</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-text">Hints per player</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm btn-square"
            aria-label="Fewer hints"
            disabled={disabled || value.hints <= 0}
            onClick={() => change({ hints: value.hints - 1 })}
          >
            −
          </button>
          <span className="w-8 text-center tabular-nums" aria-live="polite">
            {value.hints}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm btn-square"
            aria-label="More hints"
            disabled={disabled}
            onClick={() => change({ hints: value.hints + 1 })}
          >
            +
          </button>
        </div>
        <p className="text-xs opacity-60">A hint shows how the number is read, in hiragana.</p>
      </div>
    </div>
  );
}
