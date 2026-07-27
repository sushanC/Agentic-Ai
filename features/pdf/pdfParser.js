import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const execAsync = promisify(exec);

export async function ocrPDF(pdfPath) {
  const tempDir = "./temp_ocr";

  await fs.mkdir(tempDir, { recursive: true });

  const outputPrefix = path.join(tempDir, "page");

  await execAsync(`pdftoppm -r 300 -png "${pdfPath}" "${outputPrefix}"`);

  const files = (await fs.readdir(tempDir))
    .filter(file => file.endsWith(".png"))
    .sort();

  let fullText = "";

  for (const file of files) {
    const imagePath = path.join(tempDir, file);

    console.log(`OCR: ${file}`);

    const result = await Tesseract.recognize(imagePath, "eng");

    fullText += result.data.text + "\n";
  }

  await fs.rm(tempDir, {
    recursive: true,
    force: true
  });

  return fullText;
}

export async function loadPDF(pdfPath) {
  const data = new Uint8Array(await fs.readFile(pdfPath));

  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let text = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const content = await page.getTextContent();

    const pageText = content.items
      .map(item => item.str)
      .join(" ");

    text += pageText + "\n";
  }

  console.log(`${pdfPath} -> ${text.length} chars`);
  console.log(text.slice(0, 500));

  if (text.trim().length < 100) {
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
