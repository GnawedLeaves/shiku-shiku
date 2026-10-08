import { knownSplit } from "@/lib/study/missed";

/**
 * A flashcards result at a glance: how many cards were known first time vs
 * needed another go, as a two-part bar with counts and percentages.
 */
export default function KnownSplit({ known, total }: { known: number; total: number }) {
  const split = knownSplit(known, total);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-3 w-full overflow-hidden border border-iron"
        role="img"
        aria-label={`Knew ${split.knownPercent}% first time, didn't know ${split.missedPercent}%`}
      >
        <div className="h-full bg-success" style={{ width: `${split.knownPercent}%` }} />
        <div className="h-full bg-error" style={{ width: `${split.missedPercent}%` }} />
      </div>
      <div className="flex justify-between gap-3 text-body-sm">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 bg-success" aria-hidden="true" />
          Knew {split.known} · <span className="tabular-nums">{split.knownPercent}%</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 bg-error" aria-hidden="true" />
          Didn&apos;t know {split.missed} · <span className="tabular-nums">{split.missedPercent}%</span>
        </span>
      </div>
    </div>
  );
}
