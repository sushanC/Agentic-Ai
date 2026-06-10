import fs from "fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  ocrPDF
} from "./ocrService.js";

export async function loadPDF(
  pdfPath
) {

  const data =
    new Uint8Array(
      await fs.readFile(
        pdfPath
      )
    );

  const pdf =
    await pdfjsLib
      .getDocument({ data })
      .promise;

  let text = "";

  for (
    let pageNum = 1;
    pageNum <= pdf.numPages;
    pageNum++
  ) {

    const page =
      await pdf.getPage(
        pageNum
      );

    const content =
      await page.getTextContent();

    const pageText =
      content.items
        .map(
          item => item.str
        )
        .join(" ");

    text +=
      pageText + "\n";
  }

  console.log(
    `${pdfPath} -> ${text.length} chars`
  );

  console.log(
    text.slice(0, 500)
  );
  if (
  text.trim().length < 100
) {

  console.log(
    "\n⚠️ Scanned PDF detected."
  );

  console.log(
    "🔍 Running OCR...\n"
  );

  const ocrText =
    await ocrPDF(
      pdfPath
    );

  console.log(
    `OCR extracted ${ocrText.length} chars`
  );

  return ocrText;
}

return text;
}

export function chunkText(
  text,
  chunkSize = 1000
) {

  const chunks = [];

  for (
    let i = 0;
    i < text.length;
    i += chunkSize
  ) {

    chunks.push(
      text.slice(
        i,
        i + chunkSize
      )
    );
  }

  return chunks;
}