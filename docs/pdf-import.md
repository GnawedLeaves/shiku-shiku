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
  against a real Lesson 7 sheet: 38 vocabulary rows plus the 会話/練習 phrase rows.
- **Standard 2 column** — Japanese left, English right.
- **Auto-detect columns** — clusters the text by x position and labels each column by the script it
  uses. Try this first for an unfamiliar sheet.
- **Scanned sheet (OCR)** — Document AI; only selectable when configured.

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
than the word it annotates); 8pt works for A4 lesson sheets.

Rows are anchored on the numbers in the `index` column when a sheet numbers its rows, which is what
keeps a multi-line English cell attached to the row that started it. Without numbering, rows fall
back to text baselines.

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
