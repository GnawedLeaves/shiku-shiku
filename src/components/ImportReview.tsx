"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { parseSheet, type ParsedRow } from "@/lib/study/parseSheet";
import { bulkCreateCards } from "@/lib/actions/cards";

export default function ImportReview({ setId }: { setId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIsBusy(true);
    try {
      const parsed = await parseSheet(file);
      setRows(parsed);
    } finally {
      setIsBusy(false);
    }
  }

  function updateRow(index: number, field: keyof ParsedRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { question: "", answer_hiragana: "", answer_romaji: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsBusy(true);
    try {
      await bulkCreateCards(setId, rows);
      router.push(`/sets/${setId}`);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4 gap-2">
          <label className="form-control">
            <span className="label-text mb-1">Upload a PDF or image of your vocab sheet</span>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleFile}
              className="file-input file-input-bordered w-full"
            />
          </label>
          <p className="text-xs opacity-60">
            Automatic word extraction isn&apos;t wired up yet — uploading a file gives you a blank
            editable table below to fill in, or just use &quot;Add row&quot; to type entries directly.
          </p>
          {fileName && <p className="text-xs opacity-60">Loaded: {fileName}</p>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4 gap-2">
            <h3 className="font-semibold text-sm">Review &amp; edit before saving</h3>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Hiragana</th>
                    <th>Romaji</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          value={row.question}
                          onChange={(e) => updateRow(i, "question", e.target.value)}
                          className="input input-bordered input-sm w-full"
                        />
                      </td>
                      <td>
                        <input
                          value={row.answer_hiragana}
                          onChange={(e) => updateRow(i, "answer_hiragana", e.target.value)}
                          className="input input-bordered input-sm w-full"
                        />
                      </td>
                      <td>
                        <input
                          value={row.answer_romaji}
                          onChange={(e) => updateRow(i, "answer_romaji", e.target.value)}
                          className="input input-bordered input-sm w-full"
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
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={addRow}>
                + Add row
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={isBusy} onClick={handleSave}>
                Save cards
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <button type="button" className="btn btn-outline btn-sm self-start" onClick={addRow}>
          + Add row manually
        </button>
      )}
    </div>
  );
}
