import fs from "fs/promises";

import {
  getStoragePath
} from "../../storage/storagePath.js";

const PDF_MEMORY_FILE =
  getStoragePath(
    "pdf_memory.json"
  );

export async function loadPDFMemory() {

  try {

    const data =
      await fs.readFile(
        PDF_MEMORY_FILE,
        "utf-8"
      );

    return JSON.parse(
      data
    );

  } catch {

    return {};
  }
}

export async function savePDFMemory(
  memory
) {

  await fs.writeFile(
    PDF_MEMORY_FILE,
    JSON.stringify(
      memory,
      null,
      2
    )
  );
}

export async function deletePDF(
  pdfName
) {

  const memory =
    await loadPDFMemory();

  delete memory[pdfName];

  await savePDFMemory(
    memory
  );
}
