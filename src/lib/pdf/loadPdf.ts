import type { PdfPageText } from "./extractVocab";
import { collectPageText } from "./pageText";

export { MAX_PDF_PAGES } from "./pageText";

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

  try {
    return await collectPageText(await loadingTask.promise);
  } finally {
    // Releases the document and the worker it was parsed with.
    await loadingTask.destroy();
  }
}
