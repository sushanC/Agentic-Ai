import fs from "fs/promises";

import {
  getStoragePath
} from "../../storage/storagePath.js";

const HISTORY_FILE =
  getStoragePath(
    "chat_history.json"
  );

export function createChatStorage(filePath) {
  return {
    async loadHistory() {
      try {
        return JSON.parse(await fs.readFile(filePath, "utf-8"));
      } catch {
        return [];
      }
    },
    async saveHistory(history) {
      await fs.writeFile(filePath, JSON.stringify(history, null, 2), { mode: 0o600 });
    },
  };
}

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
