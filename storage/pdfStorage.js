import fs from "fs/promises";

export async function loadPDFMemory() {

  try {

    const data =
      await fs.readFile(
        "./pdf_memory.json",
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {};
  }
}

export async function savePDFMemory(
  memory
) {

  await fs.writeFile(
    "./pdf_memory.json",
    JSON.stringify(
      memory,
      null,
      2
    )
  );
}