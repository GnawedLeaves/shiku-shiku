"use client";

import type { ReactNode } from "react";
import SubmitButton from "@/components/ui/SubmitButton";

/** A submit button that asks for confirmation first, then shows a spinner while the action runs. */
export default function ConfirmSubmitButton({
  confirmText,
  className,
  pendingText,
  children,
}: {
  confirmText: string;
  className?: string;
  pendingText?: string;
  children: ReactNode;
}) {
  return (
    <SubmitButton confirmText={confirmText} className={className} pendingText={pendingText}>
      {children}
    </SubmitButton>
  );
}
