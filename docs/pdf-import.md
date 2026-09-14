# PDF vocabulary import

Written for: whoever maintains this app's import feature.

Upload a lesson PDF, the app pulls the word table out of it, you review the rows, and they become
cards. English becomes the question; hiragana and romaji become the answer.

## How a sheet is read

Two paths, tried in this order:

1. **Local layout parser** (default, free, no setup). Reads the PDF's text layer with `pdfjs-dist`,
   keeping each fragment's x/y position, then reconstructs the table from those coordinates. Pages
   with no word table — grammar explanations, notes, scans — produce no rows and are reported as
   skipped.
2. **Google Document AI** (optional). Used when the local parser finds nothing (the pages are
   scans), when the file is an image, or when the "Scanned sheet (OCR)" template is chosen. Inert
   unless configured.

Relevant files:

| File | Role |
| --- | --- |
| `src/lib/pdf/templates.ts` | Template definitions — where the columns are and what they mean |
| `src/lib/pdf/extractVocab.ts` | Layout logic: rows, columns, cells (pure, no pdfjs) |
| `src/lib/pdf/loadPdf.ts` | The only file that talks to pdfjs |
| `src/lib/pdf/roles.ts` | Guesses a column's meaning from its writing system |
| `src/lib/pdf/documentAi.ts` | Optional OCR fallback |
| `src/lib/pdf/rowsToCards.ts` | Table rows → card drafts (fills in romaji) |
| `src/app/api/import/pdf/route.ts` | Ties it together |

## Templates

A template says where the columns sit, as fractions of the page width, and which role each one
plays (`index`, `reading`, `kanji`, `english`, `other`). Shipped templates:

- **SASA Japanese lesson sheet** — the `No. / hiragana / kanji / English / Chinese` layout. Verified
  against real Lesson 6 and Lesson 7 sheets from the same course: 38 and 48 vocabulary rows
  respectively, plus phrase/reference rows sharing a page with the vocabulary table.
- **Standard 2 column** — Japanese left, English right.
- **Auto-detect columns** — clusters the text by x position and labels each column by the script it
  uses. Try this first for an unfamiliar sheet.
- **Scanned sheet (OCR)** — Document AI; only selectable when configured.

### Self-healing fallback for fixed templates

A fixed template's column bands are calibrated against one reference sheet. Other lessons from the
same course routinely shift those bands by 10pt or more even though the row numbering doesn't move
— each lesson's table gets its own auto-sized columns wherever it was generated. Left alone, that
silently drops most rows as "incomplete" (missing a required role) rather than failing loudly: a
handful of plausible-looking cards, not an error the user would notice.

`extractPage` in `extractVocab.ts` guards against this: after a fixed template's own columns are
tried, it compares the number of complete rows produced against the number of row-number anchors
actually found on the page. If fewer than `FIXED_TEMPLATE_MIN_COMPLETION` (60%) of the page's own
numbered rows came out complete, the page is re-parsed with auto-detected columns instead, and
whichever attempt completed more rows wins. This runs automatically — no template switch needed —
and is what lets the default "SASA Japanese lesson sheet" template keep working across lessons
whose tables were laid out with slightly different column widths.

### Row grouping: nearest anchor, not banding

Rows are identified by the numbers in the `index` column when a sheet numbers its rows (falling
back to text baselines otherwise). A naive approach splits the page into bands per row — using
either the midpoint between consecutive row numbers, or the next row's own position, as the
boundary. Both break down whenever a row wraps across several lines: table generators commonly
*vertically centre* every cell (including the row-number cell) against the row's tallest cell, so a
row number can sit well below the first line of a 4-line English definition in its own row, or well
above a wrapped cell's later lines. A fixed cutoff gets this wrong in one direction or the other
whenever neighbouring rows differ much in height, which is exactly what silently garbled or dropped
entries in real lesson sheets (a multi-line definition's tail bleeding into the next row's cells,
or vice versa).

Instead, every text item on the page is assigned to whichever row number is numerically *closest*
to it (`nearestAnchorIndex`). This is robust in both directions: content belonging to an unusually
tall row is, by construction, still closer to that row's own number than to a normal-height
neighbour's, and content from a normal-height row is trivially closest to its own adjacent number.

Two more filters clean up what nearest-anchor grouping alone would still catch:

- **`maxGlyphHeight`** drops glyphs above a template's threshold — a page title or lesson heading
  (e.g. "Lesson 6") repeats once per page in a much larger font than the table body, which is
  otherwise enough for it to form its own column cluster in auto-detect mode and get swept into a
  row's cells.
- **`MAX_ANCHOR_DISTANCE`** (in `extractVocab.ts`) rejects an item outright if even its *nearest*
  row number is implausibly far away — a page-footer page number ("1/7") sits in its own isolated
  spot, far below the last table row, at a normal body-text size, and often inside the wide x-range
  a detected column's band extends into.

### Kanji vs. Chinese meaning

Auto-detected columns are labelled by the script their text uses (`src/lib/pdf/roles.ts`): numeric
→ index, kana-heavy → reading, latin-heavy → english. Kanji and a Chinese meaning column are both
CJK ideographs and score identically on script alone, so picking whichever ideograph-heavy column
has the *most* content across the sheet — the obvious first approach — reliably picks the **wrong**
one: kanji cells are often blank (not every word has kanji), while the Chinese meaning is filled in
on every row, so it wins a pure volume contest. `assignColumnRoles` resolves this with position
instead, once the English column is known: kanji sits to English's left, the Chinese meaning to its
right, in every sheet seen so far.

### Adding a template

Add an entry to `PDF_TEMPLATES`. To find the column boundaries, print the text positions:

```js
// node, from the project root
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile("sheet.pdf")) }).promise;
const page = await doc.getPage(1);
for (const item of (await page.getTextContent()).items) {
  console.log(item.transform[4].toFixed(0), item.transform[5].toFixed(0), JSON.stringify(item.str));
}
```

Column bands are `x / pageWidth`. `minGlyphHeight` drops furigana (ruby text is drawn much smaller
than the word it annotates) and `maxGlyphHeight` drops page titles; 8–17pt works for A4 lesson
sheets. Remember that a fixed template's bands are only a starting point for one reference file —
the self-healing fallback above is what keeps it working on sibling lessons whose columns drifted.

## Optional: Google Document AI

Only needed for scanned or photographed sheets.

1. In Google Cloud, enable the **Document AI API**.
2. **Document AI → Processors → Create processor → Form Parser** (it returns table structure).
   Note the processor ID and its region (`us` or `eu`).
3. Create a service account with the **Document AI API User** role, and download a JSON key.
4. Set these environment variables:

   ```bash
   GOOGLE_DOCAI_PROJECT_ID=your-gcp-project-id
   GOOGLE_DOCAI_PROCESSOR_ID=abcdef1234567890
   GOOGLE_DOCAI_LOCATION=us
   # the service-account JSON, either raw or base64-encoded
   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ...}'
   ```

   On Vercel, base64 is easier to paste: `base64 -w0 key.json`.

5. Restart the dev server. "Scanned sheet (OCR)" becomes selectable on the import screen and in
   Settings.

Billing: Form Parser is around US$30 per 1000 pages at the time of writing, with a free monthly
allowance. Check current pricing before pointing it at a large backlog. The local parser handles
text PDFs at no cost, so leaving OCR for scans only is the cheap default.

## Limits

- Uploads are capped at 15 MB and the first 40 pages.
- Cells that a PDF draws as one text run spanning two columns (a few entries in the sample sheet do
  this) land in the first column — fix them in the review table before saving.
- The kanji column is only kept when it actually contains kanji; these sheets often use it for a
  kana gloss instead.
- A definition that wraps across several lines *and* embeds its own usage note in brackets on a
  later line (e.g. `homework (〜をします: do homework)`) can pick up a stray fragment of that note in
  the question — a cosmetic artifact on a handful of entries, not a dropped or wrong word. Fix it in
  the review table before saving.
- Two differently-shaped tables sharing one page (a vocabulary table followed by an unrelated
  reference list, as some lesson sheets do) can confuse auto-detected columns, since column
  detection currently works per-page rather than per-table. This mainly affects small side tables
  that aren't the page's main vocabulary content.
