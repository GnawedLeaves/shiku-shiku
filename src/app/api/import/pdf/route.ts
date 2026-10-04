import { NextResponse } from "next/server";
import { z } from "zod";
import { extractVocabRows, type ExtractionResult } from "@/lib/pdf/extractVocab";
import { readPdfText } from "@/lib/pdf/loadPdf";
import { MAX_DIRECT_UPLOAD_BYTES, MAX_PDF_PAGES } from "@/lib/pdf/pageText";
import { rowsToCards } from "@/lib/pdf/rowsToCards";
import { extractWithDocumentAi, isDocumentAiConfigured } from "@/lib/pdf/documentAi";
import { getTemplate } from "@/lib/pdf/templates";
import { getCurrentUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_TABLE_WARNING =
  "No word table was found. This PDF's pages may be scans — try the “Scanned sheet (OCR)” template (needs Document AI), pick a different template, or add the rows by hand below.";

/** Text layer read in the browser (see `loadPdfInBrowser.ts`). */
const extractedTextSchema = z.object({
  template: z.string().optional(),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().positive(),
        width: z.number(),
        height: z.number(),
        items: z.array(
          z.object({
            str: z.string(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          })
        ),
      })
    )
    .max(MAX_PDF_PAGES),
});

/**
 * Two request shapes:
 *
 * - JSON `{ template, pages }` -- the PDF's text layer, already read in the
 *   browser. This is the normal path for text PDFs and has no file-size limit.
 * - multipart `file` + `template` -- the file itself, for OCR (images, scans,
 *   the OCR template) or when the browser couldn't read the PDF. Bound by
 *   Vercel's 4.5 MB request limit.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (request.headers.get("content-type")?.includes("application/json")) {
    return handleExtractedText(request);
  }
  return handleFileUpload(request);
}

async function handleExtractedText(request: Request) {
  const parsed = extractedTextSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Could not read that PDF" }, { status: 400 });
  }

  const template = getTemplate(parsed.data.template);
  const extraction = extractVocabRows(parsed.data.pages, template.id);
  if (extraction.rows.length > 0) {
    return NextResponse.json(localResult(extraction, template.id));
  }

  // Probably scans: the browser has to send the file itself for OCR.
  if (isDocumentAiConfigured()) {
    return NextResponse.json({ ...emptyResult(template.id), needsFile: true });
  }
  return NextResponse.json({ ...emptyResult(template.id), warning: NO_TABLE_WARNING });
}

async function handleFileUpload(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const templateId = String(formData.get("template") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is larger than 4 MB" }, { status: 413 });
  }

  const template = getTemplate(templateId);
  const data = await file.arrayBuffer();
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  // OCR path: either explicitly chosen, or the only option for an image.
  const ocrOnly = template.mode === "document-ai" || !isPdf;

  if (ocrOnly) {
    if (!isDocumentAiConfigured()) {
      return NextResponse.json(
        {
          error: isPdf
            ? "OCR isn't set up on this deployment. Pick a layout template instead, or configure Document AI (see docs/pdf-import.md)."
            : "Images need OCR, which isn't set up on this deployment. Upload a PDF with selectable text, or configure Document AI (see docs/pdf-import.md).",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(await runDocumentAi(data, file.type || "application/pdf", "ocr"));
  }

  let localError: string | null = null;
  try {
    const extraction = extractVocabRows(await readPdfText(data), template.id);
    if (extraction.rows.length > 0) {
      return NextResponse.json(localResult(extraction, template.id));
    }
  } catch (error) {
    localError = error instanceof Error ? error.message : "Could not read that PDF";
  }

  // Nothing came back from the layout parser -- the pages are probably scans.
  if (isDocumentAiConfigured()) {
    try {
      return NextResponse.json(await runDocumentAi(data, "application/pdf", "ocr-fallback"));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "OCR failed" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ ...emptyResult(template.id), warning: localError ?? NO_TABLE_WARNING });
}

function localResult(extraction: ExtractionResult, templateId: string) {
  return {
    source: "local" as const,
    template: templateId,
    cards: rowsToCards(extraction.rows),
    pagesUsed: extraction.pagesUsed,
    pagesSkipped: extraction.pagesSkipped,
  };
}

function emptyResult(templateId: string) {
  return {
    source: "local" as const,
    template: templateId,
    cards: [],
    pagesUsed: [],
    pagesSkipped: [],
  };
}

async function runDocumentAi(data: ArrayBuffer, mimeType: string, source: "ocr" | "ocr-fallback") {
  const result = await extractWithDocumentAi(data, mimeType);
  return {
    source,
    template: "document-ai",
    cards: rowsToCards(result.rows),
    pagesUsed: result.pagesUsed,
    pagesSkipped: [],
    warning:
      result.rows.length === 0 ? "OCR ran but found no table rows in that file." : undefined,
  };
}
