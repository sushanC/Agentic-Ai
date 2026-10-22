import fs from "fs/promises";
import path from "path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "util";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const execFileAsync = promisify(execFile);
export const PDF_MAX_PAGES = 100;
export const PDF_MAX_OCR_PAGES = 25;

export async function ocrPDF(pdfPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samgpt-ocr-"));
  try {
    const outputPrefix = path.join(tempDir, "page");
    await execFileAsync("pdftoppm", ["-r", "300", "-png", pdfPath, outputPrefix], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    const files = (await fs.readdir(tempDir)).filter(file => file.endsWith(".png")).sort();
    let fullText = "";
    for (const file of files) {
      const result = await Tesseract.recognize(path.join(tempDir, file), "eng");
      fullText += result.data.text + "\n";
    }
    return fullText;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function loadPDF(pdfPath) {
  const data = new Uint8Array(await fs.readFile(pdfPath));

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  if (pdf.numPages > PDF_MAX_PAGES) {
    await pdf.destroy();
    const error = new Error("PDF exceeds the supported page limit.");
    error.code = "PDF_TOO_MANY_PAGES";
    throw error;
  }

  let text = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const content = await page.getTextContent();

    const pageText = content.items
      .map(item => item.str)
      .join(" ");

    text += pageText + "\n";
  }

  console.log("[PDF Parser] Text extracted", { characterCount: text.length });

  if (text.trim().length < 100) {
    if (pdf.numPages > PDF_MAX_OCR_PAGES) {
      await pdf.destroy();
      const error = new Error("Scanned PDF exceeds the supported OCR page limit.");
      error.code = "PDF_OCR_PAGE_LIMIT";
      throw error;
    }
    console.log("\n⚠️ Scanned PDF detected.");
    console.log("🔍 Running OCR...\n");

    const ocrText = await ocrPDF(pdfPath);

    console.log(`OCR extracted ${ocrText.length} chars`);

    return ocrText;
  }

  return text;
}

export function chunkText(text, chunkSize = 1000) {
  const chunks = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks;
}
