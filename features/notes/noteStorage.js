import fs from "fs/promises";

import {
  getStoragePath
} from "../../storage/storagePath.js";

const NOTES_FILE =
  getStoragePath(
    "notes.json"
  );

export async function loadNotes() {

  try {

    const data =
      await fs.readFile(
        NOTES_FILE,
        "utf-8"
      );

    return JSON.parse(
      data
    );

  } catch {

    return [];
  }
}

export async function saveNotes(
  notes
) {

  await fs.writeFile(
    NOTES_FILE,
    JSON.stringify(
      notes,
      null,
      2
    )
  );
}
