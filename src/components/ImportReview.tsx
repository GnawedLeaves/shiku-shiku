"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateCards } from "@/lib/actions/cards";
import { toRomaji } from "@/lib/japanese/kana";
import NewGroupField, { type NewGroupDraft } from "@/components/NewGroupField";
import { readPdfTextInBrowser } from "@/lib/pdf/loadPdfInBrowser";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/lib/pdf/pageText";
import { getTemplate } from "@/lib/pdf/templates";
import type { PdfPageText } from "@/lib/pdf/extractVocab";

interface ReviewRow {
  question: string;
  answer_hiragana: string;
  answer_romaji: string;
  answer_kanji: string;
  page: number;
  include: boolean;
}

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

interface ImportResponse {
  source?: "local" | "ocr" | "ocr-fallback";
  cards?: Omit<ReviewRow, "include">[];
  pagesUsed?: number[];
  pagesSkipped?: number[];
  warning?: string;
  error?: string;
  /** The text layer had no table; the server wants the file itself for OCR. */
  needsFile?: boolean;
}

const MAX_DIRECT_UPLOAD_MB = MAX_DIRECT_UPLOAD_BYTES / (1024 * 1024);

async function readResponse(response: Response): Promise<ImportResponse> {
  // A 413 from Vercel's edge is HTML, not JSON.
  const payload = (await response.json().catch(() => null)) as ImportResponse | null;
  if (!payload) {
    return {
      error:
        response.status === 413
          ? `That file is too large to upload (max ${MAX_DIRECT_UPLOAD_MB} MB).`
          : "Could not read that file",
    };
  }
  if (!response.ok && !payload.error) payload.error = "Could not read that file";
  return payload;
}

/**
 * Text PDFs are read in the browser and only their text layer is sent, so
 * they aren't bound by the server's request-size limit. The file itself is
 * uploaded only when OCR is needed or the browser can't read it.
 */
async function importFile(file: File, templateId: string): Promise<ImportResponse> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const ocrOnly = !isPdf || getTemplate(templateId).mode === "document-ai";

  let tooLargeError = `Files sent for OCR must be under ${MAX_DIRECT_UPLOAD_MB} MB. Compress the file or split it into smaller parts.`;

  if (!ocrOnly) {
    let pages: PdfPageText[] | null = null;
    try {
      pages = await readPdfTextInBrowser(file);
    } catch {
      tooLargeError = `This PDF couldn't be read in the browser, and it's too large to process on the server (max ${MAX_DIRECT_UPLOAD_MB} MB).`;
    }

    if (pages) {
      const payload = await readResponse(
        await fetch("/api/import/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: templateId, pages }),
        })
      );
      if (!payload.needsFile) return payload;
      tooLargeError = `No word table was found in the text of this PDF, and it's too large to send for OCR (max ${MAX_DIRECT_UPLOAD_MB} MB). Try a different template, or add the rows by hand below.`;
    }
  }

  if (file.size > MAX_DIRECT_UPLOAD_BYTES) return { error: tooLargeError };

  const body = new FormData();
  body.set("file", file);
  body.set("template", templateId);
  return readResponse(await fetch("/api/import/pdf", { method: "POST", body }));
}

export default function ImportReview({
  setId,
  templates,
  defaultTemplateId,
  groups,
}: {
  setId: string;
  templates: TemplateOption[];
  defaultTemplateId: string;
  groups: { id: string; name: string; color?: string | null }[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState<NewGroupDraft | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const includedCount = rows.filter((row) => row.include).length;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
    setMessage(null);
  }

  async function handleUpload() {
    if (!file) return;

    setStatus("parsing");
    setError(null);
    setMessage(null);

    try {
      const payload = await importFile(file, templateId);

      if (payload.error) {
        setError(payload.error ?? "Could not read that file");
        setRows([]);
        return;
      }

      const parsed = (payload.cards ?? []).map((card) => ({ ...card, include: true }));
      setRows(parsed);

      const parts: string[] = [];
      if (parsed.length > 0) {
        parts.push(`Found ${parsed.length} word${parsed.length === 1 ? "" : "s"}`);
        if (payload.pagesUsed?.length) parts.push(`from page ${payload.pagesUsed.join(", ")}`);
        if (payload.pagesSkipped?.length) {
          parts.push(`— skipped page ${payload.pagesSkipped.join(", ")} (no word table)`);
        }
      }
      if (payload.source !== "local" && parsed.length > 0) parts.push("via OCR");
      setMessage(parts.join(" ") || null);
      if (payload.warning) setError(payload.warning);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setStatus("idle");
    }
  }

  function updateRow(index: number, field: keyof ReviewRow, value: string | boolean) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        // Keep romaji in step when the kana is corrected by hand.
        if (field === "answer_hiragana" && typeof value === "string") {
          next.answer_romaji = toRomaji(value);
        }
        return next;
      })
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { question: "", answer_hiragana: "", answer_romaji: "", answer_kanji: "", page: 0, include: true },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleAll(include: boolean) {
    setRows((prev) => prev.map((row) => ({ ...row, include })));
  }

  async function handleSave() {
    setStatus("saving");
    setError(null);
    try {
      const saved = await bulkCreateCards(
        setId,
        rows.filter((row) => row.include),
        groupIds,
        newGroup
      );
      if (saved === 0) {
        setError("Nothing to save — each card needs a question and an answer.");
        return;
      }
      router.push(`/sets/${setId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save these cards");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card bg-base-100">
        <div className="card-body p-4 gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Sheet layout</span>
            <select
              className="select select-bordered w-full"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id} disabled={!template.available}>
                  {template.name}
                  {template.available ? "" : " — not configured"}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <span className="label-text-alt opacity-60 mt-1">{selectedTemplate.description}</span>
            )}
          </label>

          <label className="form-control">
            <span className="label-text mb-1">Choose your vocabulary PDF</span>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileChange}
              disabled={status !== "idle"}
              className="file-input file-input-bordered w-full"
            />
          </label>

          <button
            type="button"
            className="btn btn-primary btn-sm self-start"
            disabled={!file || status !== "idle"}
            onClick={handleUpload}
          >
            {status === "parsing" && <span className="loading loading-spinner loading-xs" />}
            Upload
          </button>

          <p className="text-xs opacity-60">
            Only pages that contain a word table are read — grammar pages and notes are ignored.
            Everything is shown below for review before anything is saved.
          </p>

          {status === "parsing" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="loading loading-spinner loading-sm" />
              Reading the sheet…
            </div>
          )}

          {message && <div className="alert alert-success text-sm py-2">{message}</div>}
          {error && <div className="alert alert-warning text-sm py-2">{error}</div>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card bg-base-100">
          <div className="card-body p-4 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">Review before saving</h3>
              <div className="flex gap-1">
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => toggleAll(true)}>
                  Select all
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => toggleAll(false)}>
                  Select none
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th />
                    <th>Question (English)</th>
                    <th>Hiragana</th>
                    <th>Romaji</th>
                    <th>Kanji</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={row.include ? "" : "opacity-40"}>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={row.include}
                          onChange={(e) => updateRow(i, "include", e.target.checked)}
                          aria-label={`Include ${row.question}`}
                        />
                      </td>
                      <td>
                        <input
                          value={row.question}
                          onChange={(e) => updateRow(i, "question", e.target.value)}
                          className="input input-bordered input-sm w-full min-w-40"
                        />
                      </td>
                      <td>
                        <input
                          value={row.answer_hiragana}
                          onChange={(e) => updateRow(i, "answer_hiragana", e.target.value)}
                          className="input input-bordered input-sm w-full min-w-32"
                        />
                      </td>
                      <td>
                        <input
                          value={row.answer_romaji}
                          onChange={(e) => updateRow(i, "answer_romaji", e.target.value)}
                          className="input input-bordered input-sm w-full min-w-32"
                        />
                      </td>
                      <td>
                        <input
                          value={row.answer_kanji}
                          onChange={(e) => updateRow(i, "answer_kanji", e.target.value)}
                          className="input input-bordered input-sm w-full min-w-24"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => removeRow(i)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <fieldset className="form-control flex flex-col gap-2">
              <legend className="label-text mb-1">Add these cards to groups (optional)</legend>
              {groups.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className="label cursor-pointer gap-2 rounded-field bg-base-200 px-3 py-1"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={groupIds.includes(group.id)}
                        onChange={(e) =>
                          setGroupIds((prev) =>
                            e.target.checked
                              ? [...prev, group.id]
                              : prev.filter((id) => id !== group.id)
                          )
                        }
                      />
                      {group.color && (
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="label-text">{group.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <NewGroupField onChange={setNewGroup} plural />
            </fieldset>

            <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={addRow}>
                + Add row
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={status !== "idle" || includedCount === 0}
                onClick={handleSave}
              >
                {status === "saving" && <span className="loading loading-spinner loading-xs" />}
                Save {includedCount} card{includedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 && status === "idle" && (
        <button type="button" className="btn btn-outline btn-sm self-start" onClick={addRow}>
          + Add row manually
        </button>
      )}
    </div>
  );
}
