import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import Tesseract from "tesseract.js";

const execAsync =
  promisify(exec);

export async function ocrPDF(
  pdfPath
) {

  const tempDir =
    "./temp_ocr";

  await fs.mkdir(
    tempDir,
    { recursive: true }
  );

  const outputPrefix =
    path.join(
      tempDir,
      "page"
    );

  await execAsync(
    `pdftoppm -r 300 -png "${pdfPath}" "${outputPrefix}"`
  );

  const files =
    (await fs.readdir(
      tempDir
    ))
    .filter(
      file =>
        file.endsWith(".png")
    )
    .sort();

  let fullText = "";

  for (
    const file of files
  ) {

    const imagePath =
      path.join(
        tempDir,
        file
      );

    console.log(
      `OCR: ${file}`
    );

    const result =
      await Tesseract.recognize(
        imagePath,
        "eng"
      );

    fullText +=
      result.data.text +
      "\n";
  }
  await fs.rm(
  tempDir,
  {
    recursive: true,
    force: true
  }
);

  return fullText;
}