import { readFileSync, existsSync } from "fs";
import { writeFileSync } from "fs";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { convertToMarkdown } from "../apps/web/src/lib/parser/markitdown-ts";
import { renderPdfPages } from "../apps/web/src/lib/parser/ocr";
import "./lib/config";

let failures = 0;
let skipped = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

async function run(label: string, fn: () => Promise<void>) {
  console.log(`\n== ${label} ==`);
  try {
    await fn();
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  ${label} threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function skip(label: string, reason: string) {
  skipped += 1;
  console.log(`  SKIP  ${label} (${reason})`);
}

// ---- Fixture builders ----

async function buildDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Test Heading</w:t></w:r></w:p>
<w:p><w:r><w:t>Hello from synthetic docx.</w:t></w:r></w:p>
<w:sectPr/>
</w:body>
</w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
<p:sldSz cx="9144000" cy="6858000"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Introduction</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>First point</a:t></a:r></a:p><a:p><a:r><a:t>Second point</a:t></a:r></a:p></p:txBody></p:sp>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid><a:gridCol w="1"/><a:gridCol w="1"/></a:tblGrid><a:tr h="1"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Name</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Age</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr h="1"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Ali</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>30</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld>
<p:clrMapOvr><a:overrideClrMapping/></p:clrMapOvr>
</p:sld>`
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 4"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Remember to mention the reading list.</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld>
<p:clrMapOvr><a:overrideClrMapping/></p:clrMapOvr>
</p:notes>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Name", "Role"]);
  ws.addRow(["Dr. Smith", "Professor"]);
  ws.addRow(["Ms. Ali", "TA"]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

async function getDummyPdf(): Promise<Buffer> {
  const cachePath = "/tmp/opencode/dummy.pdf";
  if (existsSync(cachePath)) return readFileSync(cachePath);
  const resp = await fetch("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf");
  if (!resp.ok) throw new Error(`dummy.pdf download failed: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(cachePath, buf);
  return buf;
}

// ---- Tests ----

async function main() {
  const hasNvidia = Boolean(process.env.NVIDIA_API_KEY);

  await run("TXT", async () => {
    const buf = Buffer.from("Hello world\nLine two\nLine three\n");
    const result = await convertToMarkdown({
      buffer: buf,
      fileName: "notes.txt",
      mimeType: "text/plain",
    });
    check("markdown preserved", result.markdown.includes("Hello world"));
    check("converter set", result.converter === "PlainTextConverter");
  });

  await run("Markdown title", async () => {
    const result = await convertToMarkdown({
      buffer: Buffer.from("# My Title\n\nBody"),
      fileName: "readme.md",
      mimeType: "text/markdown",
    });
    check("title extracted", result.title === "My Title");
  });

  await run("HTML", async () => {
    const html =
      "<html><head><title>Sample</title></head><body><h1>Heading</h1><p>Some <b>bold</b> text</p></body></html>";
    const result = await convertToMarkdown({
      buffer: Buffer.from(html),
      fileName: "page.html",
      mimeType: "text/html",
    });
    check("title extracted", result.title === "Sample");
    check("h1 heading", /^# Heading$/m.test(result.markdown));
    check("bold preserved", /\*\*bold\*\*/.test(result.markdown));
  });

  await run("CSV", async () => {
    const result = await convertToMarkdown({
      buffer: Buffer.from("Name,Role\nDr. Smith,Professor\nMs. Ali,TA"),
      fileName: "people.csv",
      mimeType: "text/csv",
    });
    check("table header", result.markdown.includes("| Name | Role |"));
    check("table row", result.markdown.includes("| Dr. Smith | Professor |"));
    check("separator row", /^\| -{3} \| -{3} \|$/m.test(result.markdown));
  });

  await run("DOCX", async () => {
    const buffer = existsSync("/tmp/opencode/test-doc.docx")
      ? readFileSync("/tmp/opencode/test-doc.docx")
      : await buildDocx();
    const result = await convertToMarkdown({
      buffer,
      fileName: "test.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    check("has content", result.markdown.trim().length > 0);
    check("converter set", result.converter === "DocxConverter");
    check("text preserved", result.markdown.includes("DOCX conversion test"));
  });

  await run("PPTX", async () => {
    const buffer = await buildPptx();
    const result = await convertToMarkdown({
      buffer,
      fileName: "deck.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    check("slide separator", result.markdown.includes("<!-- Slide number: 1 -->"));
    check("slide title heading", /^# Introduction$/m.test(result.markdown));
    check("body text", result.markdown.includes("First point"));
    check("table header", result.markdown.includes("| Name | Age |"));
    check("notes section", result.markdown.includes("### Notes:"));
    check("notes text", result.markdown.includes("reading list"));
  });

  await run("XLSX", async () => {
    const buffer = await buildXlsx();
    const result = await convertToMarkdown({
      buffer,
      fileName: "book.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    check("sheet heading", result.markdown.includes("## Sheet1"));
    check("table header", result.markdown.includes("| Name | Role |"));
    check("row preserved", result.markdown.includes("| Dr. Smith | Professor |"));
  });

  await run("PDF (text extraction)", async () => {
    const buffer = await getDummyPdf();
    const result = await convertToMarkdown({
      buffer,
      fileName: "dummy.pdf",
      mimeType: "application/pdf",
    });
    check("text extracted", result.markdown.toLowerCase().includes("dummy"));
    check("ocr flag false", result.metadata?.ocr === false);
  });

  await run("PDF (forced OCR, live)", async () => {
    if (!hasNvidia) {
      skip("forced OCR", "NVIDIA_API_KEY not set");
      return;
    }
    const buffer = await getDummyPdf();
    const result = await convertToMarkdown(
      { buffer, fileName: "dummy.pdf", mimeType: "application/pdf" },
      { ocr: true, maxOcrPages: 2 }
    );
    check("has page sections", /## Page 1/.test(result.markdown));
    check("non-empty OCR text", result.markdown.replace(/## Page \d+/, "").trim().length > 0);
    check("ocr flag true", result.metadata?.ocr === true);
    console.log("      OCR sample:", result.markdown.slice(0, 120).replace(/\n/g, " | "));
  });

  await run("IMAGE (rendered page, live OCR)", async () => {
    if (!hasNvidia) {
      skip("image OCR", "NVIDIA_API_KEY not set");
      return;
    }
    const pdfBuffer = await getDummyPdf();
    const [page] = await renderPdfPages(pdfBuffer, 1, 2);
    const result = await convertToMarkdown({
      buffer: page.buffer,
      fileName: "page.png",
      mimeType: "image/png",
    });
    check("description section", result.markdown.includes("# Description"));
    check("metadata section", result.markdown.includes("# Metadata"));
    check("filename metadata", result.markdown.includes("page.png"));
    check("non-empty OCR", result.markdown.replace(/# (Description|Metadata)/g, "").trim().length > 30);
    console.log("      OCR sample:", result.markdown.split("# Description")[1]?.slice(0, 120).replace(/\n/g, " | "));
  });

  await run("Unsupported format", async () => {
    try {
      await convertToMarkdown({ buffer: Buffer.from([1, 2, 3]), fileName: "x.rar", mimeType: "" });
      check("throws UnsupportedFormatError", false, "did not throw");
    } catch (err) {
      check("throws UnsupportedFormatError", (err as Error).name === "UnsupportedFormatError");
    }
  });

  console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${skipped} skipped) ===`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("test-parser crashed:", err);
  process.exit(1);
});