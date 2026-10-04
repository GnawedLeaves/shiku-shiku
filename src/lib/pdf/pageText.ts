import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfPageText, PdfTextItem } from "./extractVocab";

/** Hard cap so a huge upload can't tie up the parser. */
export const MAX_PDF_PAGES = 40;

/**
 * Largest file that can be POSTed to the import route as-is. Vercel rejects
 * function request bodies over 4.5 MB (with a 413) before our code runs, so
 * only OCR -- which needs the actual file -- is bound by this. Text PDFs are
 * read in the browser and have no size limit.
 */
export const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Reads every page's text with its layout coordinates from an already-opened
 * pdfjs document. Shared by the Node loader (`loadPdf.ts`) and the browser
 * loader (`loadPdfInBrowser.ts`) so both produce identical input for
 * `extractVocabRows`.
 */
export async function collectPageText(doc: PDFDocumentProxy): Promise<PdfPageText[]> {
  const pages: PdfPageText[] = [];
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const [, , , , x, y] = item.transform;
      items.push({ str: item.str, x, y, width: item.width, height: item.height });
    }

    pages.push({ pageNumber, width: viewport.width, height: viewport.height, items });
    page.cleanup();
  }

  return pages;
}
