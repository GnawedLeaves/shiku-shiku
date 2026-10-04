"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

/**
 * Fallback for any error inside the signed-in app -- a failed save, a page
 * that couldn't load. Keeps the header and bottom nav (it renders inside the
 * app layout) so the user is never stranded on a blank screen.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4 py-8">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm opacity-70">
        That didn&apos;t go through — usually a dropped connection. Your other cards and sets are
        safe. Try again, and if you were saving something, check it saved.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-outline btn-sm">
          Back to my sets
        </Link>
      </div>
    </div>
  );
}
