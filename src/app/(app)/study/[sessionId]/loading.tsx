export default function Loading() {
  return (
    <div className="flex flex-col gap-3 h-full min-h-140" aria-busy="true">
      <div className="flex items-center justify-between">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-6 w-24" />
      </div>
      <div className="skeleton h-1 w-full" />
      {/* Mirrors the study deck: a card on a stack, then the action pill. */}
      <div className="flex flex-1 min-h-0 flex-col items-center gap-4">
        <div className="relative w-full max-w-md flex-1 min-h-0 mb-12">
          <div className="absolute inset-0 translate-y-2 border border-iron" />
          <div className="absolute inset-0 translate-y-1 border border-iron bg-concrete" />
          <div className="skeleton absolute inset-0" />
        </div>
        <div className="skeleton h-12 w-full max-w-md rounded-full" />
      </div>
      <span className="sr-only">Loading your session</span>
    </div>
  );
}
