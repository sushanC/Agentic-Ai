import fs from "fs/promises";

import {
  getStoragePath
}
from "./storagePath.js";

const MEMORY_FILE =
  getStoragePath(
    "profile.json"
  );

export async function loadMemory() {

  try {

    const data =
      await fs.readFile(
        MEMORY_FILE,
        "utf-8"
      );

    return JSON.parse(
      data
    );

  } catch {

    return {};
  }
}

export async function saveMemory(
  memory
) {

  await fs.writeFile(
    MEMORY_FILE,
    JSON.stringify(
      memory,
      null,
      2
    )
  );
}

export async function deleteMemoryKey(
  key
) {

  const memory =
    await loadMemory();

  delete memory[key];

  await saveMemory(
    memory
  );
}