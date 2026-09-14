// Pure layout logic for turning PDF text items into vocabulary rows. Kept free
// of any pdfjs imports so it can be unit-tested (and reasoned about) on plain
// objects; `loadPdf.ts` is the only place that talks to pdfjs.

import { assignColumnRoles, scoreTexts } from "./roles";
import { getTemplate, type ColumnRole, type PdfTemplate, type TemplateColumn } from "./templates";

export interface PdfTextItem {
  str: string;
  /** Left edge, in PDF points from the left of the page. */
  x: number;
  /** Baseline, in PDF points from the bottom of the page. */
  y: number;
  width: number;
  height: number;
}

export interface PdfPageText {
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

export interface ExtractedRow {
  page: number;
  index: string;
  reading: string;
  kanji: string;
  english: string;
  other: string;
}

export interface ExtractionResult {
  rows: ExtractedRow[];
  /** Pages that looked like word tables and were used. */
  pagesUsed: number[];
  /** Pages skipped because they had no table (prose, scanned images, ...). */
  pagesSkipped: number[];
}

const KANA_RE = /[぀-ヿ]/;
const CJK_RE = /[㐀-鿿]/;

function clean(text: string): string {
  return (
    text
      // These sheets embed Kangxi radicals (U+2F77) where the ideograph
      // (U+624B) is meant; NFKC folds those -- and full-width punctuation --
      // back to the characters a learner would actually type.
      .normalize("NFKC")
      // pdfjs emits NUL for some spacing glyphs.
      .replace(/\u0000/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Joins cell fragments, avoiding a space between adjacent CJK glyphs. */
function joinFragments(fragments: string[]): string {
  let out = "";
  for (const raw of fragments) {
    const piece = raw.replace(/\u0000/g, " ");
    if (!piece.trim()) continue;
    if (out) {
      const last = out[out.length - 1];
      const first = piece.trim()[0];
      const bothCjk = (KANA_RE.test(last) || CJK_RE.test(last)) && (KANA_RE.test(first) || CJK_RE.test(first));
      if (!bothCjk) out += " ";
    }
    out += piece.trim();
  }
  return clean(out);
}

/** True for glyph sizes that belong to table body text, not titles or furigana. */
function isBodyGlyph(item: PdfTextItem, template: PdfTemplate): boolean {
  return item.height >= template.minGlyphHeight && item.height <= template.maxGlyphHeight;
}

function columnsFor(template: PdfTemplate, page: PdfPageText): TemplateColumn[] {
  if (template.mode === "fixed") return template.columns;
  return autoDetectColumns(page, template);
}

/**
 * Clusters item x positions into columns, then labels each cluster from the
 * script its text is written in: a column of mostly kana/kanji becomes the
 * reading, a column of mostly latin letters becomes the English meaning.
 */
function autoDetectColumns(page: PdfPageText, template: PdfTemplate): TemplateColumn[] {
  const items = page.items.filter((i) => isBodyGlyph(i, template) && clean(i.str));
  if (items.length === 0) return [];

  // Cluster the x positions that repeat down the page. Keying off the
  // histogram rather than every item keeps a one-off heading or page number
  // from dragging a column's left edge sideways.
  const histogram = new Map<number, number>();
  for (const item of items) {
    const key = Math.round(item.x);
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }

  const gap = page.width * 0.02;
  const frequent = [...histogram.entries()]
    .filter(([, count]) => count >= Math.max(2, template.minRowsPerPage))
    .map(([x]) => x)
    .sort((a, b) => a - b);

  const clusters: { start: number; items: PdfTextItem[] }[] = [];
  for (const x of frequent) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.start <= gap) continue;
    clusters.push({ start: x, items: [] });
  }
  if (clusters.length === 0) return [];

  for (const item of items) {
    let owner = -1;
    for (let i = 0; i < clusters.length; i++) {
      if (item.x >= clusters[i].start - page.width * 0.005) owner = i;
    }
    if (owner >= 0) clusters[owner].items.push(item);
  }

  const meaningful = clusters.filter((c) => c.items.length > 0);
  if (meaningful.length === 0) return [];

  const roleByCluster = assignColumnRoles(meaningful, (cluster) =>
    scoreTexts(cluster.items.map((item) => clean(item.str)))
  );

  // Each column owns the strip from its own left edge up to the next column's,
  // so neighbouring cells can never claim each other's text.
  const ordered = [...meaningful].sort((a, b) => a.start - b.start);
  const pad = page.width * 0.005;

  return ordered.map((cluster, i) => {
    const next = ordered[i + 1];
    return {
      role: roleByCluster.get(cluster) ?? "other",
      from: Math.max(0, (cluster.start - pad) / page.width),
      to: next ? (next.start - pad) / page.width : 1,
    };
  });
}

const LATIN_RE = /[A-Za-z]/;
const CJK_OR_KANA_GLOBAL_RE = /[぀-ヿ㐀-鿿]/g;

function hasLatinLetters(text: string): boolean {
  return LATIN_RE.test(text);
}

/** Removes kana/kanji/hanzi glyphs, leaving Latin text and punctuation. */
function stripCjk(text: string): string {
  return clean(text.replace(CJK_OR_KANA_GLOBAL_RE, " "));
}

/**
 * Column bands (fixed or auto-detected) are a best guess at where a sheet's
 * English column sits. When a sheet's layout doesn't quite match the guess --
 * different page margins, a wider Chinese-meaning column pushing its
 * neighbour left, English and Chinese swapped left-to-right -- Chinese (or
 * stray Japanese) text can leak into, or fully occupy, the cell meant to hold
 * the English meaning. That's what caused flashcards whose question was the
 * Chinese translation instead of English.
 *
 * This runs on every extracted row regardless of which path built it (fixed
 * template, auto-detect, or Document AI): any CJK/kana glyphs are stripped
 * out of the English cell, since a genuine English meaning never contains
 * them. If that empties the cell -- the "English" band captured nothing but
 * Chinese/Japanese -- and the neighbouring "other" cell (where Chinese
 * normally lands) has Latin text instead, the two are swapped, recovering the
 * English that ended up one column over.
 */
export function sanitizeEnglishColumn(row: ExtractedRow): ExtractedRow {
  const strippedEnglish = stripCjk(row.english);
  if (strippedEnglish) {
    return strippedEnglish === row.english ? row : { ...row, english: strippedEnglish };
  }
  if (hasLatinLetters(row.other)) {
    return { ...row, english: stripCjk(row.other), other: row.english };
  }
  return row.english ? { ...row, english: "" } : row;
}

function roleAt(columns: TemplateColumn[], xFraction: number): ColumnRole | null {
  for (const col of columns) {
    if (xFraction >= col.from && xFraction < col.to) return col.role;
  }
  return null;
}

interface RowAnchor {
  y: number;
  index: string;
}

/** Finds the row numbers in the index column, sorted top to bottom. */
function findRowAnchors(page: PdfPageText, columns: TemplateColumn[], template: PdfTemplate): RowAnchor[] {
  const indexColumn = columns.find((c) => c.role === "index");
  if (!indexColumn) return [];

  const anchors: RowAnchor[] = [];
  for (const item of page.items) {
    if (!isBodyGlyph(item, template)) continue;
    const text = clean(item.str);
    if (!/^\d{1,3}$/.test(text)) continue;
    const xFraction = item.x / page.width;
    if (xFraction < indexColumn.from || xFraction >= indexColumn.to) continue;
    anchors.push({ y: item.y, index: text });
  }
  return anchors.sort((a, b) => b.y - a.y);
}

/**
 * Finds which row a y-position belongs to when the table numbers its rows.
 * A row number is not reliably at the top of its row: table generators like
 * these commonly vertically *centre* every cell (including the row-number
 * cell) against the row's tallest cell, so a row number can sit well below
 * the first line of a tall wrapped cell in its own row (an English
 * definition running 3-4 lines), or well above a wrapped cell's later lines
 * (a bracketed usage note on its own second line). A fixed top/bottom cutoff
 * per row -- whether the midpoint between neighbours, or the next row's own
 * position -- gets this wrong in one direction or the other whenever
 * adjacent rows differ much in height, which is exactly what silently
 * dropped and garbled entries in real lesson sheets.
 *
 * Assigning each item to whichever row number is numerically *closest* to it
 * is robust in both directions: content belonging to an unusually tall row
 * is, by construction, still closer to that row's own number than to a
 * normal-height neighbour's, and content from a normal-height row is
 * trivially closest to its own (adjacent) number.
 */
function nearestAnchorIndex(y: number, anchors: RowAnchor[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const distance = Math.abs(anchors[i].y - y);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

function buildRow(page: PdfPageText, cells: Record<ColumnRole, string[]>, index: string): ExtractedRow {
  return sanitizeEnglishColumn({
    page: page.pageNumber,
    index: index || joinFragments(cells.index),
    reading: joinFragments(cells.reading),
    kanji: joinFragments(cells.kanji),
    english: joinFragments(cells.english),
    other: joinFragments(cells.other),
  });
}

function isRowComplete(row: ExtractedRow, template: PdfTemplate): boolean {
  return template.requireRoles.every((role) => {
    if (role === "index") return Boolean(row.index);
    return Boolean(row[role as "reading" | "kanji" | "english" | "other"]);
  });
}

function emptyCells(): Record<ColumnRole, string[]> {
  return { index: [], reading: [], kanji: [], english: [], other: [] };
}

// A page-footer page-number ("1/7") sits in its own isolated spot, far below
// the last table row, but at a normal body-text size and often inside the
// wide x-range a detected column's band extends into. Nearest-anchor
// attribution alone would still sweep it into whichever row's anchor happens
// to be closest -- usually the last one on the page. The real per-item
// distances seen even in unusually tall wrapped rows top out well under this,
// so anything farther out is content the table doesn't own at all.
const MAX_ANCHOR_DISTANCE = 50;

function extractPageByAnchors(
  page: PdfPageText,
  columns: TemplateColumn[],
  anchors: RowAnchor[],
  template: PdfTemplate
): ExtractedRow[] {
  const buckets = anchors.map(() => emptyCells());

  const eligible = page.items
    .filter((item) => isBodyGlyph(item, template))
    .sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x - b.x));

  for (const item of eligible) {
    const text = clean(item.str);
    if (!text) continue;
    const role = roleAt(columns, item.x / page.width);
    if (!role) continue;
    const rowIndex = nearestAnchorIndex(item.y, anchors);
    if (Math.abs(anchors[rowIndex].y - item.y) > MAX_ANCHOR_DISTANCE) continue;
    buckets[rowIndex][role].push(text);
  }

  const rows: ExtractedRow[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const row = buildRow(page, buckets[i], anchors[i].index);
    if (isRowComplete(row, template)) rows.push(row);
  }
  return rows;
}

/** Used when a page's table has no row numbers to anchor on. */
function extractPageByBaselines(
  page: PdfPageText,
  columns: TemplateColumn[],
  template: PdfTemplate
): ExtractedRow[] {
  const baselines = new Map<number, number>();
  for (const item of page.items) {
    if (!isBodyGlyph(item, template) || !clean(item.str)) continue;
    const key = Math.round(item.y);
    baselines.set(key, (baselines.get(key) ?? 0) + 1);
  }
  const ys = [...baselines.keys()].sort((a, b) => b - a);
  const bands = ys.map((y, i) => ({
    top: i === 0 ? y + 6 : (ys[i - 1] + y) / 2,
    bottom: i === ys.length - 1 ? y - 6 : (y + ys[i + 1]) / 2,
  }));

  const rows: ExtractedRow[] = [];
  for (const band of bands) {
    const cells = emptyCells();
    const inBand = page.items
      .filter((item) => isBodyGlyph(item, template))
      .filter((item) => item.y <= band.top && item.y > band.bottom)
      .sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x - b.x));

    for (const item of inBand) {
      const text = clean(item.str);
      if (!text) continue;
      const role = roleAt(columns, item.x / page.width);
      if (!role) continue;
      cells[role].push(text);
    }

    const row = buildRow(page, cells, "");
    if (isRowComplete(row, template)) rows.push(row);
  }
  return rows;
}

function extractWithColumns(
  page: PdfPageText,
  columns: TemplateColumn[],
  template: PdfTemplate
): ExtractedRow[] {
  const anchors = findRowAnchors(page, columns, template);
  if (anchors.length >= template.minRowsPerPage) {
    return extractPageByAnchors(page, columns, anchors, template);
  }
  return extractPageByBaselines(page, columns, template);
}

// A fixed template's column bands are calibrated against one reference
// sheet. Other lessons from the same course routinely shift those bands by
// 10pt or more even though the row numbering doesn't move (each lesson's
// table gets its own auto-sized columns when the source document was
// generated), which silently drops most rows as incomplete rather than
// failing loudly -- a handful of plausible-looking cards, not an error. If
// completing fewer than this fraction of the page's own numbered rows
// suggests exactly that, the page is re-parsed with auto-detected columns
// and whichever attempt actually completed more rows wins.
const FIXED_TEMPLATE_MIN_COMPLETION = 0.6;

function extractPage(page: PdfPageText, template: PdfTemplate): ExtractedRow[] {
  const columns = columnsFor(template, page);
  if (columns.length === 0) return [];

  const rows = extractWithColumns(page, columns, template);
  if (template.mode !== "fixed") return rows;

  const anchors = findRowAnchors(page, columns, template);
  const expected = Math.max(anchors.length, template.minRowsPerPage);
  if (rows.length / expected >= FIXED_TEMPLATE_MIN_COMPLETION) return rows;

  const autoColumns = autoDetectColumns(page, template);
  if (autoColumns.length === 0) return rows;

  const autoRows = extractWithColumns(page, autoColumns, template);
  return autoRows.length > rows.length ? autoRows : rows;
}

export function extractVocabRows(
  pages: PdfPageText[],
  templateId: string | null | undefined
): ExtractionResult {
  const template = getTemplate(templateId);
  const rows: ExtractedRow[] = [];
  const pagesUsed: number[] = [];
  const pagesSkipped: number[] = [];

  for (const page of pages) {
    const pageRows = extractPage(page, template);
    if (pageRows.length >= template.minRowsPerPage) {
      rows.push(...pageRows);
      pagesUsed.push(page.pageNumber);
    } else {
      pagesSkipped.push(page.pageNumber);
    }
  }

  return { rows, pagesUsed, pagesSkipped };
}
