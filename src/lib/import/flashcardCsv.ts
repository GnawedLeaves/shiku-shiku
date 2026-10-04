// Parses flashcard CSV exports (GoodNotes 5 "Export flashcards" and similar):
// no header row, one card per record, front in the first column and back in
// the second. Runs entirely in the browser -- the file never leaves it.

import { normalizeReading, toRomaji } from "@/lib/japanese/kana";
import type { ParsedRow } from "@/lib/pdf/rowsToCards";

/**
 * RFC 4180 CSV: quoted fields may contain the delimiter, newlines, and `""`
 * for a literal quote. GoodNotes quotes any side of a card that has a comma
 * or spans several lines.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * A multi-line card side (a list of conjugations, a note under the word)
 * becomes one line, since the card fields are single-line.
 */
function flatten(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * Front → question, back → answer. GoodNotes cards are usually written in
 * romaji; a back that is already Japanese (no Latin letters) goes in the
 * hiragana field instead, with romaji generated from it.
 */
export function flashcardCsvToCards(text: string): ParsedRow[] {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = !firstLine.includes(",") && firstLine.includes("\t") ? "\t" : ",";

  const seen = new Set<string>();
  const cards: ParsedRow[] = [];

  // Strip a UTF-8 BOM, which some exporters prepend.
  for (const [front = "", back = ""] of parseCsv(text.replace(/^﻿/, ""), delimiter)) {
    const question = flatten(front);
    const answer = flatten(back);
    if (!question || !answer) continue;

    const key = `${question}\u0000${answer}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isJapanese = !/[A-Za-z]/.test(answer);
    cards.push({
      question,
      answer_hiragana: isJapanese ? normalizeReading(answer) : "",
      answer_romaji: isJapanese ? toRomaji(answer) : answer,
      answer_kanji: "",
      page: 0,
    });
  }

  return cards;
}

export function isCsvFile(file: File): boolean {
  return file.type === "text/csv" || /\.(csv|tsv|txt)$/i.test(file.name);
}
