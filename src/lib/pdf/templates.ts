// Parsing templates for vocabulary sheets. A template describes where the
// columns of a word table sit on the page and what each column means, so new
// school/textbook layouts can be supported by adding an entry here instead of
// changing the parser.

export type ColumnRole = "index" | "reading" | "kanji" | "english" | "other";

export interface TemplateColumn {
  role: ColumnRole;
  /** Horizontal band the column occupies, as a fraction of the page width. */
  from: number;
  to: number;
}

export interface PdfTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * "fixed" uses the `columns` bands below. "auto" ignores them and clusters
   * the text by x position, then guesses each column's role from its content.
   * "document-ai" sends the file to Google Document AI for OCR + table
   * detection, and is only offered when that integration is configured.
   */
  mode: "fixed" | "auto" | "document-ai";
  columns: TemplateColumn[];
  /** A row is only kept when all of these roles have text. */
  requireRoles: ColumnRole[];
  /** Pages yielding fewer rows than this are treated as non-table pages. */
  minRowsPerPage: number;
  /**
   * Glyphs shorter than this (in pt) are dropped -- furigana/ruby text sits
   * above the word it annotates and would otherwise pollute the cells.
   */
  minGlyphHeight: number;
}

export const PDF_TEMPLATES: PdfTemplate[] = [
  {
    id: "sasa-japanese",
    name: "SASA Japanese lesson sheet",
    description:
      "No. / hiragana / kanji / English / Chinese table, as used in the SASA Japanese lesson PDFs.",
    mode: "fixed",
    columns: [
      // The reading column starts at x=47pt on a 595pt page; the band boundary
      // sits just left of it so section labels in the margin stay out.
      { role: "index", from: 0.03, to: 0.0785 },
      { role: "reading", from: 0.0785, to: 0.29 },
      { role: "kanji", from: 0.29, to: 0.46 },
      { role: "english", from: 0.46, to: 0.72 },
      { role: "other", from: 0.72, to: 0.97 },
    ],
    requireRoles: ["reading", "english"],
    minRowsPerPage: 3,
    minGlyphHeight: 8,
  },
  {
    id: "standard-2col",
    name: "Standard 2 column",
    description: "Japanese on the left, English meaning on the right.",
    mode: "fixed",
    columns: [
      { role: "reading", from: 0.0, to: 0.5 },
      { role: "english", from: 0.5, to: 1.0 },
    ],
    requireRoles: ["reading", "english"],
    minRowsPerPage: 3,
    minGlyphHeight: 6,
  },
  {
    id: "auto",
    name: "Auto-detect columns",
    description:
      "Works out the columns from the layout and guesses which one is Japanese and which is English. Try this for a sheet no other template handles.",
    mode: "auto",
    columns: [],
    requireRoles: ["reading", "english"],
    minRowsPerPage: 3,
    minGlyphHeight: 6,
  },
  {
    id: "document-ai",
    name: "Scanned sheet (OCR)",
    description:
      "Sends the file to Google Document AI to read tables off a scan or photo. Needs the Document AI environment variables; see docs/pdf-import.md.",
    mode: "document-ai",
    columns: [],
    requireRoles: ["reading", "english"],
    minRowsPerPage: 1,
    minGlyphHeight: 0,
  },
];

export const DEFAULT_TEMPLATE_ID = "sasa-japanese";

export function getTemplate(id: string | null | undefined): PdfTemplate {
  return (
    PDF_TEMPLATES.find((t) => t.id === id) ??
    PDF_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!
  );
}
