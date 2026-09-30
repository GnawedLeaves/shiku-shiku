/** Max length of a card's remarks (stored in `cards.notes`). */
export const REMARKS_MAX_LENGTH = 300;

/** Remarks longer than this are collapsed behind "Show more" in study mode. */
export const REMARKS_PREVIEW_LENGTH = 100;

/** Trims and caps remarks from a form; empty becomes null. */
export function normalizeRemarks(raw: unknown): string | null {
  const value = String(raw ?? "").trim().slice(0, REMARKS_MAX_LENGTH);
  return value || null;
}
