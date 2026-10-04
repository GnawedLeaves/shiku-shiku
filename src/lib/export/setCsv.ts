export const SET_CSV_HEADER = ["English", "Hiragana", "Romaji", "Kanji", "Groups", "Remarks"];

/** Quotes a field when it holds a comma, quote or line break (RFC 4180). */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  // CRLF and a UTF-8 BOM so Excel opens Japanese text correctly.
  return "﻿" + rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
