"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that shows a spinner while its form's action is in flight.
 * Drop-in replacement for a plain `<button>` inside a Server Action form.
 */
export default function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary btn-sm",
  confirmText,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  confirmText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      data-pending={pending ? "" : undefined}
      onClick={(event) => {
        if (confirmText && !confirm(confirmText)) event.preventDefault();
      }}
    >
      {pending ? (
        <>
          <span className="loading loading-spinner loading-xs" aria-hidden="true" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
