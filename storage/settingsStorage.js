// storage/settingsStorage.js

import fs from "fs/promises";
import { getStoragePath } from "./storagePath.js";

const SETTINGS_FILE =
  getStoragePath("settings.json");

export async function loadSettings() {

  try {

    const data =
      await fs.readFile(
        SETTINGS_FILE,
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {
      model: "DeepSeek"
    };
  }
}

export async function saveSettings(
  settings
) {

  await fs.writeFile(
    SETTINGS_FILE,
    JSON.stringify(
      settings,
      null,
      2
    )
  );
}