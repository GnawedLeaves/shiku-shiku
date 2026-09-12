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
  const items = page.items.filter((i) => i.height >= template.minGlyphHeight && clean(i.str));
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

function roleAt(columns: TemplateColumn[], xFraction: number): ColumnRole | null {
  for (const col of columns) {
    if (xFraction >= col.from && xFraction < col.to) return col.role;
  }
  return null;
}

/**
 * Splits a page into row bands. When the table numbers its rows (the common
 * case) the numbers anchor the bands, which keeps multi-line cells attached to
 * the row that started them. Otherwise bands come from the baselines.
 */
function rowBands(
  page: PdfPageText,
  columns: TemplateColumn[],
  template: PdfTemplate
): { top: number; bottom: number; index: string }[] {
  const indexColumn = columns.find((c) => c.role === "index");
  const anchors: { y: number; index: string }[] = [];

  if (indexColumn) {
    for (const item of page.items) {
      if (item.height < template.minGlyphHeight) continue;
      const text = clean(item.str);
      if (!/^\d{1,3}$/.test(text)) continue;
      const xFraction = item.x / page.width;
      if (xFraction < indexColumn.from || xFraction >= indexColumn.to) continue;
      anchors.push({ y: item.y, index: text });
    }
  }

  if (anchors.length < template.minRowsPerPage) {
    // No usable numbering: fall back to baseline grouping.
    const baselines = new Map<number, number>();
    for (const item of page.items) {
      if (item.height < template.minGlyphHeight || !clean(item.str)) continue;
      const key = Math.round(item.y);
      baselines.set(key, (baselines.get(key) ?? 0) + 1);
    }
    const ys = [...baselines.keys()].sort((a, b) => b - a);
    return ys.map((y, i) => ({
      top: i === 0 ? y + 6 : (ys[i - 1] + y) / 2,
      bottom: i === ys.length - 1 ? y - 6 : (y + ys[i + 1]) / 2,
      index: "",
    }));
  }

  anchors.sort((a, b) => b.y - a.y);
  return anchors.map((anchor, i) => {
    const prevMid = i === 0 ? null : (anchors[i - 1].y + anchor.y) / 2;
    const nextMid = i === anchors.length - 1 ? null : (anchor.y + anchors[i + 1].y) / 2;
    const halfHeight = nextMid !== null ? anchor.y - nextMid : prevMid !== null ? prevMid - anchor.y : 10;
    return {
      top: prevMid ?? anchor.y + halfHeight,
      bottom: nextMid ?? anchor.y - halfHeight,
      index: anchor.index,
    };
  });
}

function extractPage(page: PdfPageText, template: PdfTemplate): ExtractedRow[] {
  const columns = columnsFor(template, page);
  if (columns.length === 0) return [];

  const bands = rowBands(page, columns, template);
  if (bands.length < template.minRowsPerPage) return [];

  const rows: ExtractedRow[] = [];

  for (const band of bands) {
    const cells: Record<ColumnRole, string[]> = {
      index: [],
      reading: [],
      kanji: [],
      english: [],
      other: [],
    };

    const inBand = page.items
      .filter((item) => item.height >= template.minGlyphHeight)
      .filter((item) => item.y <= band.top && item.y > band.bottom)
      .sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x - b.x));

    for (const item of inBand) {
      const text = clean(item.str);
      if (!text) continue;
      const role = roleAt(columns, item.x / page.width);
      if (!role) continue;
      cells[role].push(text);
    }

    const row: ExtractedRow = {
      page: page.pageNumber,
      index: band.index || joinFragments(cells.index),
      reading: joinFragments(cells.reading),
      kanji: joinFragments(cells.kanji),
      english: joinFragments(cells.english),
      other: joinFragments(cells.other),
    };

    const complete = template.requireRoles.every((role) => {
      if (role === "index") return Boolean(row.index);
      return Boolean(row[role as "reading" | "kanji" | "english" | "other"]);
    });
    if (complete) rows.push(row);
  }

  return rows;
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
