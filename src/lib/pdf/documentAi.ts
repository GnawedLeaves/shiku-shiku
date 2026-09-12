// Optional Google Document AI fallback for sheets the local layout parser
// can't read -- scans, photos, or layouts with no text layer. Everything here
// is inert until the GOOGLE_DOCAI_* environment variables are set, so the app
// works fully without a GCP project.
//
// Setup is documented in docs/pdf-import.md.

import { createSign } from "node:crypto";
import type { ExtractedRow } from "./extractVocab";
import { assignColumnRoles, scoreTexts } from "./roles";
import type { ColumnRole } from "./templates";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface DocAiTextSegment {
  startIndex?: string;
  endIndex?: string;
}

interface DocAiLayout {
  textAnchor?: { textSegments?: DocAiTextSegment[] };
}

interface DocAiCell {
  layout?: DocAiLayout;
}

interface DocAiRow {
  cells?: DocAiCell[];
}

interface DocAiTable {
  headerRows?: DocAiRow[];
  bodyRows?: DocAiRow[];
}

interface DocAiPage {
  pageNumber?: number;
  tables?: DocAiTable[];
}

interface DocAiResponse {
  document?: {
    text?: string;
    pages?: DocAiPage[];
  };
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    // Accept either raw JSON or the base64 form that's easier to paste into
    // hosting provider dashboards.
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

export function documentAiConfig() {
  const projectId = process.env.GOOGLE_DOCAI_PROJECT_ID;
  const processorId = process.env.GOOGLE_DOCAI_PROCESSOR_ID;
  const location = process.env.GOOGLE_DOCAI_LOCATION ?? "us";
  const serviceAccount = readServiceAccount();

  if (!projectId || !processorId || !serviceAccount) return null;
  return { projectId, processorId, location, serviceAccount };
}

export function isDocumentAiConfigured(): boolean {
  return documentAiConfig() !== null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Exchanges a signed service-account assertion for an access token. Done by
 * hand (node:crypto + fetch) to avoid pulling the full Google auth SDK into
 * the server bundle for one call.
 */
async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64Url(signer.sign(account.private_key));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google auth failed (${response.status}): ${await response.text()}`);
  }

  const token = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: token.access_token, expiresAt: now + token.expires_in };
  return token.access_token;
}

function cellText(cell: DocAiCell, documentText: string): string {
  const segments = cell.layout?.textAnchor?.textSegments ?? [];
  let text = "";
  for (const segment of segments) {
    const start = Number(segment.startIndex ?? 0);
    const end = Number(segment.endIndex ?? 0);
    text += documentText.slice(start, end);
  }
  return text.replace(/\s+/g, " ").trim();
}

function tableToRows(table: DocAiTable, documentText: string, pageNumber: number): ExtractedRow[] {
  const bodyRows = table.bodyRows ?? [];
  if (bodyRows.length === 0) return [];

  const grid = bodyRows.map((row) => (row.cells ?? []).map((cell) => cellText(cell, documentText)));
  const columnCount = Math.max(...grid.map((row) => row.length));
  if (columnCount < 2) return [];

  const columnIndexes = Array.from({ length: columnCount }, (_, i) => i);
  const roleByColumn = assignColumnRoles(columnIndexes, (index) =>
    scoreTexts(grid.map((row) => row[index] ?? ""))
  );

  const rows: ExtractedRow[] = [];
  for (const cells of grid) {
    const row: ExtractedRow = {
      page: pageNumber,
      index: "",
      reading: "",
      kanji: "",
      english: "",
      other: "",
    };

    for (const columnIndex of columnIndexes) {
      const value = cells[columnIndex] ?? "";
      if (!value) continue;
      const role: ColumnRole = roleByColumn.get(columnIndex) ?? "other";
      row[role] = row[role] ? `${row[role]} ${value}` : value;
    }

    if (row.reading && row.english) rows.push(row);
  }

  return rows;
}

export interface DocumentAiResult {
  rows: ExtractedRow[];
  pagesUsed: number[];
}

/** Runs the configured processor over a document and returns vocabulary rows. */
export async function extractWithDocumentAi(
  data: ArrayBuffer,
  mimeType: string
): Promise<DocumentAiResult> {
  const config = documentAiConfig();
  if (!config) throw new Error("Document AI is not configured");

  const token = await getAccessToken(config.serviceAccount);
  const endpoint =
    `https://${config.location}-documentai.googleapis.com/v1/projects/${config.projectId}` +
    `/locations/${config.location}/processors/${config.processorId}:process`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      skipHumanReview: true,
      rawDocument: {
        mimeType,
        content: Buffer.from(data).toString("base64"),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Document AI request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as DocAiResponse;
  const documentText = payload.document?.text ?? "";
  const rows: ExtractedRow[] = [];
  const pagesUsed: number[] = [];

  for (const page of payload.document?.pages ?? []) {
    const pageNumber = Number(page.pageNumber ?? pagesUsed.length + 1);
    const pageRows = (page.tables ?? []).flatMap((table) =>
      tableToRows(table, documentText, pageNumber)
    );
    if (pageRows.length > 0) {
      rows.push(...pageRows);
      pagesUsed.push(pageNumber);
    }
  }

  return { rows, pagesUsed };
}
