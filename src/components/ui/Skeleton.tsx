export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-4 w-full ${className}`} />;
}

/** Placeholder shaped like the card rows used across list pages. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body p-4 gap-2">
        <SkeletonLine className="w-1/3 h-5" />
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} className={i === lines - 1 ? "w-2/3" : ""} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 3, lines = 2 }: { rows?: number; lines?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

export function SkeletonPage({ title = true, rows = 3 }: { title?: boolean; rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {title && <SkeletonLine className="w-40 h-6" />}
      <SkeletonList rows={rows} />
    </div>
  );
}
