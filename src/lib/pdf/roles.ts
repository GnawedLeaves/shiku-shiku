// Works out what a column of a vocabulary table means from the writing system
// its text uses. Shared by the local layout parser (which scores clusters of
// PDF text items) and the Document AI path (which scores table cells).

import type { ColumnRole } from "./templates";

const KANA_RE = /[぀-ヿ]/;
const CJK_RE = /[㐀-鿿]/;
const LATIN_RE = /[A-Za-z]/;

export interface ColumnScore {
  kana: number;
  ideographs: number;
  latin: number;
  numeric: number;
}

export function scoreTexts(texts: Iterable<string>): ColumnScore {
  const score: ColumnScore = { kana: 0, ideographs: 0, latin: 0, numeric: 0 };
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    if (/^\d+$/.test(text)) score.numeric += 1;
    else if (KANA_RE.test(text)) score.kana += 1;
    else if (CJK_RE.test(text)) score.ideographs += 1;
    else if (LATIN_RE.test(text)) score.latin += 1;
  }
  return score;
}

/**
 * Assigns at most one column to each role, strongest candidate first:
 * a digits-only column is the row number, the most kana-heavy column is the
 * reading, the most ideograph-heavy of what's left is the kanji, and the most
 * latin column is the English meaning. Everything else is "other".
 */
export function assignColumnRoles<T>(columns: T[], score: (column: T) => ColumnScore): Map<T, ColumnRole> {
  const scored = columns.map((column) => ({ column, score: score(column) }));
  const roles = new Map<T, ColumnRole>();
  const taken = new Set<(typeof scored)[number]>();

  const claim = (candidate: (typeof scored)[number] | undefined, role: ColumnRole) => {
    if (!candidate) return;
    taken.add(candidate);
    roles.set(candidate.column, role);
  };
  const available = () => scored.filter((s) => !taken.has(s));

  claim(
    available().find((s) => s.score.numeric > s.score.kana + s.score.ideographs + s.score.latin),
    "index"
  );
  claim(
    available()
      .sort((a, b) => b.score.kana - a.score.kana)
      .find((s) => s.score.kana > 0),
    "reading"
  );
  claim(
    available()
      .sort((a, b) => b.score.ideographs - a.score.ideographs)
      .find((s) => s.score.ideographs > 0),
    "kanji"
  );
  claim(
    available()
      .sort((a, b) => b.score.latin - a.score.latin)
      .find((s) => s.score.latin > 0),
    "english"
  );

  return roles;
}
