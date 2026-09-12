import type { PdfPageText, PdfTextItem } from "./extractVocab";

/** Hard cap so a huge upload can't tie up the server. */
export const MAX_PDF_PAGES = 40;

/**
 * Reads every page's text with its layout coordinates. Uses the pdfjs legacy
 * build, which runs on Node without a worker or DOM. `pdfjs-dist` is listed in
 * `serverExternalPackages` so it isn't bundled.
 */
export async function readPdfText(data: ArrayBuffer): Promise<PdfPageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    disableFontFace: true,
    // Keep going when a page has a broken font or image -- we only want text.
    stopAtErrors: false,
  });
  const doc = await loadingTask.promise;

  const pages: PdfPageText[] = [];

  try {
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
  } finally {
    // Releases the document and the worker it was parsed with.
    await loadingTask.destroy();
  }

  return pages;
}
