import "./lib/config";
import { readFileSync } from "node:fs";
import { convertToMarkdown } from "../apps/web/src/lib/parser/markitdown-ts";
import type { ConvertOptions } from "../apps/web/src/lib/parser/types";

const BASE = "/mnt/c/Users/aabda/Downloads";

const FILES: Array<{ path: string; label: string; options?: ConvertOptions }> = [
  { path: "PDF/General/Final exam-2026-V1.pdf", label: "PDF text (final exam)" },
  { path: "PDF/General/cv.pdf", label: "PDF text (cv)" },
  { path: "PDF/HSE/HSE_Curriculum_Summary.pdf", label: "PDF text (HSE summary)" },
  { path: "PDF/UDST/UDST Website Downloadable Calendar 2025 - 2026 17_250823_231907.pdf", label: "PDF text (calendar)" },
  { path: "PDF/CHEM/Topic 3 - Chemical Kinetics.pdf", label: "PDF text (chem kinetics)" },
  { path: "PDF/HSE/A.0-Breathing-Apparatus.pdf", label: "PDF likely-scanned (OCR)" },
  { path: "Office/Final exam-2026-V1.1.docx", label: "DOCX (final exam)" },
  { path: "Office/Dear Dr.docx", label: "DOCX (Dear Dr)" },
  { path: "Office/CHEM1021-Experiment 8-organic reactions and polymers instructions.docx", label: "DOCX (chem lab)" },
  { path: "Student Referral Form (1).docx", label: "DOCX (referral form)" },
  { path: "Office/AEEL1101-MT8-Network Theorems (4).pptx", label: "PPTX (network theorems)" },
  { path: "Office/Lesson 1-introduction to health-safety and environment.pptx", label: "PPTX (HSE lesson 1)" },
  { path: "Office/EX1-01-CashFlow.xlsx", label: "XLSX (cashflow)" },
  { path: "Images/5-stress-among-students-infographics___media_library_original_1600_900.jpg", label: "IMAGE (infographic OCR)" },
  { path: "RESEARCH_REPORT.html", label: "HTML (research report)" },
  { path: "autoflow-report-10.8.23-2026-07-26_161524Z.md", label: "MD (autoflow report)" },
];

let passed = 0;
let failed = 0;
let skipped = 0;

function head(text: string, n = 400): string {
  return text.replace(/\s*\n\s*/g, "\n").slice(0, n);
}

async function main() {
  for (const { path, label, options } of FILES) {
    const full = `${BASE}/${path}`;
    if (!exists(full)) {
      skipped++;
      console.log(`\n== ${label} ==\n  SKIP  file not found: ${full}`);
      continue;
    }
    try {
      const buffer = readFileSync(full);
      const started = Date.now();
      const result = await convertToMarkdown({ buffer, fileName: path.split("/").pop() ?? "file" }, options);
      const ms = Date.now() - started;
      const ok = result.markdown.trim().length > 0;
      console.log(`\n== ${label} (${(buffer.length / 1024).toFixed(0)} KB, ${ms} ms) ==`);
      console.log(`  ${ok ? "PASS" : "FAIL"}  converter=${result.converter}  md=${result.markdown.length} chars`);
      console.log(`  title=${JSON.stringify(result.title)}`);
      console.log(`  meta=${JSON.stringify(result.metadata)}`);
      console.log(`  --- output head ---`);
      console.log(head(result.markdown));
      if (ok) passed++;
      else failed++;
    } catch (err) {
      failed++;
      console.log(`\n== ${label} ==\n  FAIL  threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n=== ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} passed, ${skipped} skipped) ===`);
  process.exit(failed === 0 ? 0 : 1);
}

function exists(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});