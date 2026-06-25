import fs from "fs/promises";

import {
  getStoragePath
} from "./storagePath.js";

const SUMMARY_FILE =
  getStoragePath("summary.json");

export async function loadSummary() {

  try {

    const data =
      await fs.readFile(
        SUMMARY_FILE,
        "utf8"
      );

    return JSON.parse(data);

  } catch {

    return {
      summary: ""
    };
  }
}

export async function saveSummary(
  summary
) {

  await fs.writeFile(
    SUMMARY_FILE,
    JSON.stringify(
      summary,
      null,
      2
    )
  );
}