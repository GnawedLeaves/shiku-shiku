export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex items-center justify-between">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-6 w-24" />
      </div>
      <div className="skeleton h-2 w-full" />
      <div className="flex flex-col items-center gap-4">
        <div className="skeleton w-full max-w-sm h-56 rounded-box" />
        <div className="flex gap-4">
          <div className="skeleton h-12 w-12 rounded-full" />
          <div className="skeleton h-12 w-12 rounded-full" />
        </div>
      </div>
      <span className="sr-only">Loading your session</span>
    </div>
  );
}
