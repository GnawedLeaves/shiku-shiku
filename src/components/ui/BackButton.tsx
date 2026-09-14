"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * A top-left back button for subpages. Prefers real browser back (so the
 * scroll position / form state of the previous page is preserved), and falls
 * back to a fixed destination `href` when there's no in-app history to go
 * back to (e.g. the page was opened directly from a bookmark or shared link).
 */
export default function BackButton({ href, label = "Back" }: { href: string; label?: string }) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent) {
    // `history.length > 1` is a rough heuristic, not proof the previous entry
    // is inside this app -- but it's the best signal available client-side,
    // and the worst case is landing on `href` instead of a truly prior page.
    if (typeof window !== "undefined" && window.history.length > 1) {
      event.preventDefault();
      router.back();
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="btn btn-ghost btn-sm self-start -ml-2 gap-1"
      aria-label={label}
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
