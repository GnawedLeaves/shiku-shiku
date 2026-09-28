"use client";

import Link, { useLinkStatus } from "next/link";

/**
 * A button-styled <Link> that shows a spinner (and optionally different text)
 * while the page it points to is loading, so a tap on a slow connection is
 * visibly acknowledged.
 */
export default function LinkButton({
  href,
  className,
  pendingText,
  children,
}: {
  href: string;
  className: string;
  pendingText?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className}>
      <LinkButtonLabel pendingText={pendingText}>{children}</LinkButtonLabel>
    </Link>
  );
}

// useLinkStatus only works in a component rendered inside the <Link>.
function LinkButtonLabel({
  pendingText,
  children,
}: {
  pendingText?: string;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{children}</>;
  return (
    <>
      <span className="loading loading-spinner loading-xs" aria-hidden="true" />
      {pendingText ?? children}
    </>
  );
}
