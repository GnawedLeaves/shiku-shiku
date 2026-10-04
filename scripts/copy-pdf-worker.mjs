// Copies pdfjs's worker into public/ so the browser-side PDF reader
// (src/lib/pdf/loadPdfInBrowser.ts) can load it from a stable URL. Bundling it
// with `new URL(..., import.meta.url)` doesn't work because pdfjs-dist is a
// server-external package. Runs before `dev` and `build`.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgDir = require.resolve("pdfjs-dist/package.json").replace(/package\.json$/, "");
copyFileSync(`${pkgDir}build/pdf.worker.min.mjs`, "public/pdf.worker.min.mjs");
