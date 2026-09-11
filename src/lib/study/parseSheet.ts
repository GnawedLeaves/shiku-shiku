export interface ParsedRow {
  question: string;
  answer_hiragana: string;
  answer_romaji: string;
}

/**
 * Extracts question/answer rows from an uploaded vocab sheet (PDF or image).
 * Not wired to a real OCR/parsing backend yet -- returns blank editable rows
 * so the upload -> review -> save flow works end to end. Swap the body of
 * this function for a real implementation (vision model or OCR call) once a
 * sample sheet is available; nothing else in the app needs to change.
 */
export async function parseSheet(_file: File): Promise<ParsedRow[]> {
  const blankRowCount = 5;
  return Array.from({ length: blankRowCount }, () => ({
    question: "",
    answer_hiragana: "",
    answer_romaji: "",
  }));
}
