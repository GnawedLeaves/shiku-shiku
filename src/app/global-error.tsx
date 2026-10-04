"use client"; // Error boundaries must be Client Components

/**
 * Last-resort fallback when the root layout itself fails. Replaces the whole
 * document, so it brings its own <html> and <body> and can't rely on app CSS.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p>Please try again.</p>
        <button type="button" onClick={() => retry()} style={{ padding: "8px 16px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
