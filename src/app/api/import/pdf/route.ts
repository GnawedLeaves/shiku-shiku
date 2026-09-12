import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractVocabRows } from "@/lib/pdf/extractVocab";
import { readPdfText } from "@/lib/pdf/loadPdf";
import { rowsToCards } from "@/lib/pdf/rowsToCards";
import { extractWithDocumentAi, isDocumentAiConfigured } from "@/lib/pdf/documentAi";
import { getTemplate } from "@/lib/pdf/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const templateId = String(formData.get("template") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is larger than 15 MB" }, { status: 413 });
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
    const pages = await readPdfText(data);
    const extraction = extractVocabRows(pages, template.id);

    if (extraction.rows.length > 0) {
      return NextResponse.json({
        source: "local" as const,
        template: template.id,
        cards: rowsToCards(extraction.rows),
        pagesUsed: extraction.pagesUsed,
        pagesSkipped: extraction.pagesSkipped,
      });
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

  return NextResponse.json({
    source: "local" as const,
    template: template.id,
    cards: [],
    pagesUsed: [],
    pagesSkipped: [],
    warning:
      localError ??
      "No word table was found. This PDF's pages may be scans — try the “Scanned sheet (OCR)” template (needs Document AI), pick a different template, or add the rows by hand below.",
  });
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
