import fs from "fs/promises";

export async function loadNotes() {

  try {

    const data =
      await fs.readFile(
        "./notes.json",
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return [];
  }
}

export async function saveNotes(
  notes
) {

  await fs.writeFile(
    "./notes.json",
    JSON.stringify(
      notes,
      null,
      2
    )
  );
}