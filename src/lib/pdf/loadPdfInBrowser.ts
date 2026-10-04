import type { PdfPageText } from "./extractVocab";
import { collectPageText } from "./pageText";

/**
 * Browser-side counterpart of `readPdfText`. Reading the text layer on the
 * client means only the (small) text positions are sent to the server, not
 * the PDF itself -- Vercel rejects function request bodies over 4.5 MB, which
 * many lesson PDFs exceed.
 */
export async function readPdfTextInBrowser(file: File): Promise<PdfPageText[]> {
  const pdfjs = await import("pdfjs-dist");
  // Copied into public/ by scripts/copy-pdf-worker.mjs before dev and build.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true,
    stopAtErrors: false,
  });

  try {
    return await collectPageText(await loadingTask.promise);
  } finally {
    await loadingTask.destroy();
  }
}
