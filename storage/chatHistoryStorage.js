import fs from "fs/promises";

import {
  getStoragePath
}
from "./storagePath.js";

const HISTORY_FILE =
  getStoragePath(
    "chat_history.json"
  );

export async function loadHistory() {

  try {

    const data =
      await fs.readFile(
        HISTORY_FILE,
        "utf-8"
      );

    return JSON.parse(
      data
    );

  } catch {

    return [];
  }
}

export async function saveHistory(
  history
) {

  await fs.writeFile(
    HISTORY_FILE,
    JSON.stringify(
      history,
      null,
      2
    )
  );
}